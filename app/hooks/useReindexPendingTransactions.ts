import { useEffect, useRef } from "react";
import type { TransactionHistory } from "../types";
import { reindexSingleTransaction } from "../lib/reindex";

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
      const txHash = transaction.tx_hash!;
      const network = transaction.network!;

      // Track reindexed transactions to prevent duplicate API calls
      reindexedTxHashesRef.current.add(txHash);

      // Reindex in background without blocking
      reindexSingleTransaction(txHash, network).catch((error) => {
        console.error(`Failed to reindex transaction ${txHash}:`, error);
        // Allow retry by removing from tracking set
        reindexedTxHashesRef.current.delete(txHash);
      });
    });
  }, [transactions, enabled]);
}
