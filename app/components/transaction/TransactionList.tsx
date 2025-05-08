"use client";
import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { toast } from "sonner";
import { fetchTransactions } from "../../api/aggregator";
import type { Transaction } from "../../types";
import { PiSpinnerBold } from "react-icons/pi";
import { formatNumberWithCommas } from "../../utils";

interface TransactionListProps {
  onSelectTransaction: (transaction: Transaction) => void;
}

export function TransactionList({ onSelectTransaction }: TransactionListProps) {
  const { user, getAccessToken } = usePrivy();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const embeddedWallet = user?.linkedAccounts.find(
    (account) =>
      account.type === "wallet" && account.connectorType === "embedded",
  ) as { address: string } | undefined;

  const walletAddress = embeddedWallet?.address;

  const fetchTransactionData = async () => {
    if (!walletAddress) return;
    setLoading(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("No access token available");
      }
      const data = await fetchTransactions(
        walletAddress,
        accessToken,
        page,
        limit,
      );
      if (data.success) {
        setTransactions(data.data.transactions);
        setTotal(data.data.total);
      }
    } catch (error) {
      console.error("Error fetching transactions:", error);
      toast.error("Failed to fetch transactions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (walletAddress) {
      fetchTransactionData();
    }
  }, [walletAddress, page]);

  if (!walletAddress) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <p className="text-gray-500 dark:text-white/50">
          Transaction history is only available for embedded wallets.
        </p>
        <p className="mt-2 text-sm text-gray-400 dark:text-white/30">
          Please use an embedded wallet to view your transaction history.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <PiSpinnerBold className="size-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
        <p className="text-lg font-medium text-gray-900 dark:text-white">
          No transactions yet
        </p>
        <p className="text-sm text-gray-500 dark:text-white/50">
          Your transaction history will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="scrollbar-hide max-h-[60vh] space-y-2 overflow-y-auto">
        {transactions.map((tx) => (
          <button
            key={tx.id}
            onClick={() => onSelectTransaction(tx)}
            className="w-full rounded-lg border border-border-light p-4 text-left hover:bg-gray-50 dark:border-white/5 dark:hover:bg-white/5"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-text-body dark:text-white">
                  {formatNumberWithCommas(tx.amount_sent)} {tx.from_currency} →{" "}
                  {formatNumberWithCommas(tx.amount_received)} {tx.to_currency}
                </p>
                <p className="mt-1 text-sm text-gray-500 dark:text-white/50">
                  To: {tx.recipient.account_name} ({tx.recipient.institution})
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span
                  className={`rounded-full px-2 py-1 text-xs ${
                    tx.status === "completed" || tx.status === "settled"
                      ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                      : tx.status === "failed" || tx.status === "refunded"
                        ? "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400"
                        : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400"
                  }`}
                >
                  {tx.status}
                </span>
                <span className="text-xs text-gray-500 dark:text-white/50">
                  {new Date(tx.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {total > limit && (
        <div className="flex justify-center gap-2 pt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-lg border border-border-light px-4 py-2 text-sm disabled:opacity-50 dark:border-white/5"
          >
            Previous
          </button>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page * limit >= total}
            className="rounded-lg border border-border-light px-4 py-2 text-sm disabled:opacity-50 dark:border-white/5"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
