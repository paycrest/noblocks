import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import type { TransactionHistory, TransactionStatus } from "../types";
import {
  fetchTransactions,
  fetchOrderDetails,
  updateTransactionDetails,
} from "../api/aggregator";
import { useNetwork } from "./NetworksContext";
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
  ) => Promise<void>;
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
  const { selectedNetwork } = useNetwork();
  const { user, getAccessToken } = usePrivy();
  const reindexedTxHashesRef = useRef<Set<string>>(new Set());
  const transactionsRef = useRef<TransactionHistory[]>([]);
  const pollingInFlightRef = useRef(false);

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
          tx.order_id && tx.status !== "completed" && tx.status !== "refunded",
      );
      if (nonFinalTxs.length === 0) return;

      await Promise.all(
        nonFinalTxs.map(async (tx) => {
          try {
            // fetch order details
            const res = await fetchOrderDetails(
              selectedNetwork.chain.id,
              tx.order_id!,
            );

            // Determine new txHash and refund reason
            let newTxHash: string | undefined;
            let refundReason: string | undefined;
            const orderData = res.data;
            if (orderData.status === "refunded") {
              newTxHash = orderData.txHash;
              refundReason =
                orderData.cancellationReasons?.length &&
                orderData.cancellationReasons[0]
                  ? orderData.cancellationReasons.join(", ")
                  : undefined;
            } else if (Array.isArray(orderData.txReceipts)) {
              // Prefer validated, settled, then pending
              const relevantReceipt = orderData.txReceipts.find(
                (r: { status: string }) => r.status === "pending",
              );
              newTxHash = relevantReceipt?.txHash;
            }

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

            // update transaction status or txHash or refund_reason if changed
            const statusChanged = orderData.status !== tx.status;
            const hashChanged = newTxHash && newTxHash !== tx.tx_hash;
            const refundReasonChanged =
              refundReason !== undefined && refundReason !== tx.refund_reason;
            if (statusChanged || hashChanged || refundReasonChanged) {
              // Update backend
              await updateTransactionDetails({
                transactionId: tx.id,
                status: orderData.status,
                txHash: newTxHash,
                refundReason: refundReason ?? undefined,
                accessToken,
                walletAddress,
              });

              const updatedTransaction = {
                ...tx,
                status: ["validated", "settled"].includes(orderData.status)
                  ? "completed"
                  : (orderData.status as TransactionStatus),
                tx_hash: newTxHash ?? tx.tx_hash,
                refund_reason: refundReason ?? tx.refund_reason,
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
            // Fail silently
            console.error("Error reconciling transaction status:", err);
          }
        }),
      );
    },
    [selectedNetwork],
  );

  const fetchTransactionData = useCallback(
    async (
      walletAddress: string,
      accessToken: string,
      page: number,
      limit: number,
    ) => {
      const cacheKey = `${walletAddress}-${page}-${limit}`;
      const cachedData = cache[cacheKey];
      const now = Date.now();
      const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

      // Return cached data if it exists and is not expired
      if (cachedData && now - cachedData.timestamp < CACHE_DURATION) {
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
        setError(error as Error);
        console.error("Error fetching transactions:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [cache, reconcileTransactionStatuses],
  );

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
        tx.status !== "completed" && tx.status !== "refunded" && tx.order_id,
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
