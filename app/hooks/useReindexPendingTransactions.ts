import { useEffect, useRef } from "react";
import { reindexTransaction } from "../api/aggregator";
import { normalizeNetworkForRateFetch } from "../utils";
import { networks } from "../mocks";
import type { TransactionHistory } from "../types";

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
): Promise<void> => {
  const maxRetries = 3;

  // Validate transaction has required fields
  if (!transaction.tx_hash || !transaction.network) {
    return;
  }

  // Convert network name to API format
  const apiNetwork = normalizeNetworkForRateFetch(transaction.network);

  // Only reindex if network is supported
  const supportedNetworks = networks.map((network) =>
    normalizeNetworkForRateFetch(network.chain.name),
  );
  if (!supportedNetworks.includes(apiNetwork)) {
    console.warn(
      `Reindex not supported for network: ${transaction.network} (${apiNetwork})`,
    );
    return;
  }

  // Retry loop for OrderCreated validation
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await reindexTransaction(
        apiNetwork,
        transaction.tx_hash,
      );

      // Extract OrderCreated event count from response
      const orderCreated = Number(response?.events?.OrderCreated ?? 0);
      const hasValidOrderCreated = orderCreated > 0;

      if (hasValidOrderCreated) {
        console.log(
          `Transaction reindexed: ${transaction.tx_hash} on ${apiNetwork}, OrderCreated: ${orderCreated}`,
        );
        return;
      }

      if (attempt === maxRetries) {
        console.warn(
          `Reindex completed but OrderCreated is ${orderCreated} for tx ${transaction.tx_hash} on ${apiNetwork} after ${maxRetries + 1} attempts`,
        );
        return;
      }
    } catch (error) {
      if (attempt === maxRetries) {
        console.error(
          `Error reindexing transaction ${transaction.tx_hash} on ${apiNetwork} after ${
            maxRetries + 1
          } attempts:`,
          error,
        );
        // Re-throw error so caller can handle cleanup
        throw error;
      }
      // fall through to schedule next attempt
    }

    const delay = getExponentialDelay(attempt);
    console.log(
      `OrderCreated not found for tx ${transaction.tx_hash} on ${apiNetwork}, retrying in ${delay}ms (attempt ${
        attempt + 1
      }/${maxRetries})`,
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
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
