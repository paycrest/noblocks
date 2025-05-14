import React, { createContext, useContext, useState, useCallback } from "react";
import type { TransactionHistory, TransactionStatus } from "../types";
import {
  fetchTransactions,
  fetchOrderDetails,
  updateTransactionStatus,
  updateTransactionDetails,
} from "../api/aggregator";
import { useNetwork } from "./NetworksContext";

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

            // Determine new txHash
            let newTxHash: string | undefined;
            const orderData = res.data;
            if (orderData.status === "refunded") {
              newTxHash = orderData.txHash;
            } else if (Array.isArray(orderData.txReceipts)) {
              // Prefer validated, settled, then pending
              const relevantReceipt = orderData.txReceipts.find(
                (r: { status: string }) =>
                  ["validated", "settled", "pending"].includes(r.status),
              );
              newTxHash = relevantReceipt?.txHash;
            }

            // update transaction status or txHash if changed
            const statusChanged = orderData.status !== tx.status;
            const hashChanged = newTxHash && newTxHash !== tx.tx_hash;
            if (statusChanged || hashChanged) {
              // Update backend
              await updateTransactionDetails({
                transactionId: tx.id,
                status: orderData.status,
                txHash: newTxHash,
                accessToken,
                walletAddress,
              });

              // Update local state without re-rendering
              setTransactions((prev) =>
                prev.map((t) =>
                  t.id === tx.id
                    ? {
                        ...t,
                        status: ["validated", "settled"].includes(
                          orderData.status,
                        )
                          ? "completed"
                          : (orderData.status as TransactionStatus),
                        tx_hash: newTxHash ?? t.tx_hash,
                      }
                    : t,
                ),
              );
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
  }, []);

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
