"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import axios from "axios";
import type { TransactionHistory, OrderDetailsData } from "../types";
import {
  fetchTransactions,
  fetchOrderDetails,
  fetchV2SenderPaymentOrderById,
  updateTransactionDetails,
  updateBridgeTransactionStatus,
  mapAggregatorStatusToDbStatus,
  resolveOnrampOrderStatusFromV2Response,
  unwrapV2SenderOrderEnvelope,
} from "../api/aggregator";
import { usePrivy } from "@privy-io/react-auth";
import { reindexSingleTransaction } from "../lib/reindex";

// Polling interval and reindex threshold (30 seconds)
const POLLING_INTERVAL_MS = 30 * 1000;

interface TransactionsContextType {
  transactions: TransactionHistory[];
  total: number;
  isLoading: boolean;
  error: Error | null;
  currentPage: number;
  fetchTransactions: (
    walletAddress: string,
    accessToken: string,
    page: number,
    limit: number,
    forceRefresh?: boolean,
  ) => Promise<void>;
  refreshTransactions: () => Promise<void>;
  clearTransactions: () => void;
  setPage: (page: number) => void;
}

const TransactionsContext = createContext<TransactionsContextType | undefined>(
  undefined,
);

export function TransactionsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [transactions, setTransactions] = useState<TransactionHistory[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [cache, setCache] = useState<
    Record<
      string,
      { data: TransactionHistory[]; total: number; timestamp: number }
    >
  >({});
  const { user, getAccessToken } = usePrivy();
  const reindexedTxHashesRef = useRef<Set<string>>(new Set());
  const transactionsRef = useRef<TransactionHistory[]>([]);
  const pollingInFlightRef = useRef(false);
  const fetchingRef = useRef(false);

  // Keep ref in sync with state
  useEffect(() => {
    transactionsRef.current = transactions;
  }, [transactions]);

  // Background reconciliation logic
  const reconcileTransactionStatuses = useCallback(
    async (
      txs: TransactionHistory[],
      walletAddress: string,
      accessToken: string,
    ) => {
      const nonFinalTxs = txs.filter(
        (tx) =>
          tx.order_id &&
          tx.transaction_type !== "bridge" &&
          tx.status !== "completed" &&
          tx.status !== "refunded" &&
          tx.status !== "expired",
      );
      if (nonFinalTxs.length === 0) return;

      await Promise.all(
        nonFinalTxs.map(async (tx) => {
          try {
            const isOnrampTx = tx.transaction_type === "onramp";
            let orderData: OrderDetailsData | null = null;

            if (isOnrampTx) {
              const res = await fetchV2SenderPaymentOrderById(
                tx.order_id!,
                accessToken,
              );
              const resolvedStatus = resolveOnrampOrderStatusFromV2Response(res);
              orderData =
                unwrapV2SenderOrderEnvelope(res) ??
                (res as unknown as { data?: OrderDetailsData }).data ??
                null;
              if (orderData && resolvedStatus !== undefined) {
                orderData = { ...orderData, status: resolvedStatus };
              }
            } else {
              const res = await fetchOrderDetails(
                tx.order_id!,
                accessToken,
                { network: tx.network },
              );
              orderData = res.data;
            }

            if (!orderData) {
              return;
            }

            let newTxHash: string | undefined;
            if (orderData.status === "refunded") {
              newTxHash = orderData.txHash;
            } else if (Array.isArray(orderData.txReceipts)) {
              const relevantReceipt = orderData.txReceipts.find(
                (r: { status: string }) => r.status === "pending",
              );
              newTxHash = relevantReceipt?.txHash;
            }
            newTxHash =
              newTxHash ||
              orderData.txHash ||
              orderData.txReceipts?.find((r) => r.txHash)?.txHash ||
              orderData.txReceipts?.[0]?.txHash;

            // Reindex pending transactions older than 30 seconds to sync with blockchain state
            if (
              orderData.status === "pending" &&
              tx.tx_hash &&
              tx.network &&
              !reindexedTxHashesRef.current.has(tx.tx_hash)
            ) {
              const timeElapsed =
                Date.now() - new Date(tx.created_at).getTime();

              if (timeElapsed > POLLING_INTERVAL_MS) {
                const txHash = tx.tx_hash;
                const network = tx.network;

                // Track reindexed transactions to prevent duplicate API calls
                reindexedTxHashesRef.current.add(txHash);

                // Reindex in background without blocking reconciliation
                reindexSingleTransaction(txHash, network).catch((error) => {
                  console.error(
                    `Failed to reindex transaction ${txHash}:`,
                    error,
                  );
                  // Allow retry in next polling cycle
                  reindexedTxHashesRef.current.delete(txHash);
                });
              }
            }

            const nextDbStatus = mapAggregatorStatusToDbStatus(
              orderData.status,
              { onramp: isOnrampTx },
            );
            const statusChanged = nextDbStatus !== tx.status;
            const hashChanged = Boolean(
              newTxHash && newTxHash !== tx.tx_hash,
            );
            if (statusChanged || hashChanged) {
              // Update backend
              await updateTransactionDetails({
                transactionId: tx.id,
                status: orderData.status,
                txHash: newTxHash,
                accessToken,
                walletAddress,
                isOnramp: isOnrampTx,
              });

              const updatedTransaction = {
                ...tx,
                status: nextDbStatus,
                tx_hash: newTxHash ?? tx.tx_hash,
              };

              // Update local state
              setTransactions((prev) =>
                prev.map((t) => (t.id === tx.id ? updatedTransaction : t)),
              );

              // Update cache to maintain consistency
              setCache((prevCache) => {
                const updatedCache = { ...prevCache };
                Object.keys(updatedCache).forEach((cacheKey) => {
                  const cachedData = updatedCache[cacheKey];
                  const updatedTransactions = cachedData.data.map((t) =>
                    t.id === tx.id ? updatedTransaction : t,
                  );
                  updatedCache[cacheKey] = {
                    ...cachedData,
                    data: updatedTransactions,
                  };
                });
                return updatedCache;
              });
            }
          } catch (err) {
            if (axios.isAxiosError(err) && err.response?.status === 404) {
              return;
            }
            console.error("Error reconciling transaction status:", err);
          }
        }),
      );

      // Reconcile pending bridge transactions via NEAR Intents / LI.FI status APIs.
      // Bridge order_id is the deposit address (NEAR) or txHash (LI.FI).
      const pendingBridgeTxs = txs.filter(
        (tx) =>
          tx.transaction_type === "bridge" &&
          tx.order_id &&
          tx.status !== "completed" &&
          tx.status !== "refunded" &&
          tx.status !== "failed" &&
          tx.status !== "expired",
      );

      await Promise.all(
        pendingBridgeTxs.map(async (tx) => {
          try {
            const isNear = tx.recipient?.institution === "NEAR Intents";
            const url = isNear
              ? `/api/bridge/near-intents/status?depositAddress=${encodeURIComponent(tx.order_id!)}`
              : `/api/bridge/lifi/status?txHash=${encodeURIComponent(tx.order_id!)}`;

            const res = await fetch(url, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (!res.ok) return;
            const data = await res.json();

            const bridgeStatus: string = data.status ?? "";
            let nextStatus: "completed" | "refunded" | "failed" | null = null;
            if (bridgeStatus === "SUCCESS") nextStatus = "completed";
            else if (bridgeStatus === "REFUNDED") nextStatus = "refunded";
            else if (bridgeStatus === "FAILED") nextStatus = "failed";

            if (!nextStatus || nextStatus === tx.status) return;

            await updateBridgeTransactionStatus(tx.id, nextStatus, accessToken, walletAddress);

            const updated = { ...tx, status: nextStatus };
            setTransactions((prev) =>
              prev.map((t) => (t.id === tx.id ? updated : t)),
            );
            setCache((prevCache) => {
              const updatedCache = { ...prevCache };
              Object.keys(updatedCache).forEach((key) => {
                const cached = updatedCache[key];
                updatedCache[key] = {
                  ...cached,
                  data: cached.data.map((t) => (t.id === tx.id ? updated : t)),
                };
              });
              return updatedCache;
            });
          } catch {
            // non-fatal — retry on next poll
          }
        }),
      );
    },
    [],
  );

  const cacheRef = useRef(cache);
  cacheRef.current = cache;

  const fetchTransactionData = useCallback(
    async (
      walletAddress: string,
      accessToken: string,
      page: number,
      limit: number,
      forceRefresh?: boolean,
    ) => {
      const cacheKey = `${walletAddress}-${page}-${limit}`;
      const cachedData = cacheRef.current[cacheKey];
      const now = Date.now();
      const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

      // Return cached data if it exists and is not expired
      if (
        !forceRefresh &&
        cachedData &&
        now - cachedData.timestamp < CACHE_DURATION
      ) {
        setTransactions(cachedData.data);
        setTotal(cachedData.total);

        // Trigger reconciliation in background
        reconcileTransactionStatuses(
          cachedData.data,
          walletAddress,
          accessToken,
        );
        return;
      }

      setIsLoading(true);
      fetchingRef.current = true;
      setError(null);

      try {
        const data = await fetchTransactions(
          walletAddress,
          accessToken,
          page,
          limit,
        );
        if (data.success) {
          setTransactions(data.data.transactions);
          setTotal(data.data.total);
          // Update cache
          setCache((prev) => ({
            ...prev,
            [cacheKey]: {
              data: data.data.transactions,
              total: data.data.total,
              timestamp: now,
            },
          }));

          // Trigger reconciliation in background
          reconcileTransactionStatuses(
            data.data.transactions,
            walletAddress,
            accessToken,
          );
        }
      } catch (error) {
        if (axios.isAxiosError(error)) {
          console.error("Error fetching transactions:", {
            status: error.response?.status,
            message: error.message,
          });
        } else {
          console.error("Error fetching transactions:", error);
        }
        setError(error as Error);
      } finally {
        setIsLoading(false);
        fetchingRef.current = false;
      }
    },
    [reconcileTransactionStatuses],
  );

  const refreshTransactions = useCallback(async () => {
    const embeddedWallet = user?.linkedAccounts.find(
      (account) =>
        account.type === "wallet" && account.connectorType === "embedded",
    ) as { address: string } | undefined;

    const walletAddress = embeddedWallet?.address;
    if (!walletAddress) return;

    const accessToken = await getAccessToken();
    if (!accessToken) return;

    // Clear cache for this page so concurrent fetches also hit the network
    const cacheKey = `${walletAddress}-${currentPage}-10`;
    if (cacheKey in cacheRef.current) {
      const next = { ...cacheRef.current };
      delete next[cacheKey];
      cacheRef.current = next;
    }
    setCache((prev) => {
      if (cacheKey in prev) {
        const next = { ...prev };
        delete next[cacheKey];
        return next;
      }
      return prev;
    });

    await fetchTransactionData(walletAddress, accessToken, currentPage, 10, true);
  }, [user, getAccessToken, currentPage, fetchTransactionData]);

  const clearTransactions = useCallback(() => {
    setTransactions([]);
    setTotal(0);
    setError(null);
    setCurrentPage(1);
    setCache({});
    reindexedTxHashesRef.current.clear();
  }, []);

  // Polling mechanism for incomplete transactions
  useEffect(() => {
    if (!user) {
      return;
    }

    // Get incomplete transactions (pending, processing, fulfilled)
    const incompleteTransactions = transactions.filter(
      (tx) =>
        tx.status !== "completed" &&
        tx.status !== "refunded" &&
        tx.status !== "expired" &&
        tx.order_id,
    );

    if (incompleteTransactions.length === 0) {
      return;
    }

    // Get wallet address from user
    const embeddedWallet = user.linkedAccounts.find(
      (account) =>
        account.type === "wallet" && account.connectorType === "embedded",
    ) as { address: string } | undefined;

    const walletAddress = embeddedWallet?.address;
    if (!walletAddress) {
      return;
    }

    // Set up polling interval (30 seconds)
    const intervalId = setInterval(async () => {
      // Prevent overlapping reconciliation runs
      if (pollingInFlightRef.current) {
        return;
      }
      pollingInFlightRef.current = true;

      try {
        // Get current incomplete transactions from ref
        const currentIncomplete = transactionsRef.current.filter(
          (tx) =>
            tx.status !== "completed" &&
            tx.status !== "refunded" &&
            tx.status !== "expired" &&
            tx.order_id,
        );

        if (currentIncomplete.length === 0) {
          return;
        }

        const accessToken = await getAccessToken();
        if (accessToken) {
          await reconcileTransactionStatuses(
            currentIncomplete,
            walletAddress,
            accessToken,
          );
        }
      } catch (error) {
        console.error("Error during polling reconciliation:", error);
      } finally {
        pollingInFlightRef.current = false;
      }
    }, POLLING_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [transactions, user, getAccessToken, reconcileTransactionStatuses]);

  return (
    <TransactionsContext.Provider
      value={{
        transactions,
        total,
        isLoading,
        error,
        currentPage,
        fetchTransactions: fetchTransactionData,
        refreshTransactions,
        clearTransactions,
        setPage: setCurrentPage,
      }}
    >
      {children}
    </TransactionsContext.Provider>
  );
}

export function useTransactions() {
  const context = useContext(TransactionsContext);
  if (context === undefined) {
    throw new Error(
      "useTransactions must be used within a TransactionsProvider",
    );
  }
  return context;
}
