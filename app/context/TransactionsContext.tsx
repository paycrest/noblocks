import React, { createContext, useContext, useState, useCallback } from "react";
import type { TransactionHistory } from "../types";
import { fetchTransactions } from "../api/aggregator";

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
        }
      } catch (error) {
        setError(error as Error);
        console.error("Error fetching transactions:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [cache],
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
