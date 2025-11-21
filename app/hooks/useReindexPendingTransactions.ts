import { useEffect, useRef } from "react";
import { reindexTransaction } from "../api/aggregator";
import { normalizeNetworkForRateFetch } from "../utils";
import type { TransactionHistory } from "../types";

/**
 * Supported networks for reindex endpoint
 */
const SUPPORTED_NETWORKS = [
  "base",
  "bnb-smart-chain",
  "lisk",
  "tron",
  "celo",
  "arbitrum-one",
  "polygon",
];

/**
 * Helper function for exponential backoff delay
 */
const getExponentialDelay = (attempt: number): number => {
  return Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
};

/**
 * Reindexes a single pending transaction with retry logic
 */
const reindexSingleTransaction = async (
  transaction: TransactionHistory,
  retryAttempt: number = 0,
): Promise<void> => {
  const maxRetries = 3;

  // Validate transaction has required fields
  if (!transaction.tx_hash || !transaction.network) {
    return;
  }

  // Convert network name to API format
  const apiNetwork = normalizeNetworkForRateFetch(transaction.network);

  // Only reindex if network is supported
  if (!SUPPORTED_NETWORKS.includes(apiNetwork)) {
    console.warn(
      `Reindex not supported for network: ${transaction.network} (${apiNetwork})`,
    );
    return;
  }

  try {
    const response = await reindexTransaction(apiNetwork, transaction.tx_hash);

    // Check if OrderCreated event exists and is greater than 0
    const orderCreated = response?.data?.events?.OrderCreated;
    const hasValidOrderCreated = orderCreated !== undefined && orderCreated > 0;

    if (!hasValidOrderCreated && retryAttempt < maxRetries) {
      // OrderCreated is 0 or not present, retry with exponential backoff
      const delay = getExponentialDelay(retryAttempt);
      console.log(
        `Reindex successful but OrderCreated is ${orderCreated || 0} for tx ${transaction.tx_hash}, retrying in ${delay}ms (attempt ${retryAttempt + 1}/${maxRetries})`,
      );

      // Schedule retry
      setTimeout(() => {
        reindexSingleTransaction(transaction, retryAttempt + 1);
      }, delay);
      return;
    }

    console.log(
      `Transaction reindexed: ${transaction.tx_hash} on ${apiNetwork}, OrderCreated: ${orderCreated || 0}`,
    );
  } catch (error) {
    // Error handling is done in reindexTransaction with exponential retry
    // If it still fails after all retries, fail silently
    if (retryAttempt >= maxRetries) {
      console.error(
        `Error reindexing transaction ${transaction.tx_hash} after ${maxRetries} retries:`,
        error,
      );
    }
  }
};

/**
 * Hook to automatically reindex pending transactions when they are provided
 * @param transactions - Array of transactions to check for pending status
 * @param enabled - Whether to enable reindexing (default: true)
 */
export function useReindexPendingTransactions(
  transactions: TransactionHistory[],
  enabled: boolean = true,
): void {
  const reindexedTxHashesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || !transactions || transactions.length === 0) {
      return;
    }

    // Filter for pending transactions that haven't been reindexed yet
    const pendingTransactions = transactions.filter(
      (tx) =>
        tx.status === "pending" &&
        tx.tx_hash &&
        tx.network &&
        !reindexedTxHashesRef.current.has(tx.tx_hash),
    );

    // Reindex each pending transaction
    pendingTransactions.forEach((transaction) => {
      // Mark as being reindexed to prevent duplicate calls
      reindexedTxHashesRef.current.add(transaction.tx_hash!);

      // Reindex in background (don't await)
      reindexSingleTransaction(transaction).catch((error) => {
        console.error(
          `Failed to reindex transaction ${transaction.tx_hash}:`,
          error,
        );
        // Remove from set on failure so it can be retried later
        reindexedTxHashesRef.current.delete(transaction.tx_hash!);
      });
    });
  }, [transactions, enabled]);
}
