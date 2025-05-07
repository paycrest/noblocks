"use client";
import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { toast } from "sonner";
import { fetchTransactions, saveTransaction } from "../api/aggregator";
import type { Transaction } from "../types";
import { PiSpinnerBold } from "react-icons/pi";
import { formatNumberWithCommas } from "../utils";
import { motion, AnimatePresence } from "framer-motion";

export default function TestTransactionsPage() {
  const { user, getAccessToken } = usePrivy();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingTransaction, setAddingTransaction] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const isSmartWallet = user?.linkedAccounts.some(
    (account) => account.type === "smart_wallet",
  );

  const smartWallet = user?.linkedAccounts.find(
    (account) => account.type === "smart_wallet",
  );

  const embeddedWallet = user?.linkedAccounts.find(
    (account) => account.type === "wallet",
  );

  const walletAddress = smartWallet?.address || embeddedWallet?.address;

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

  const addMockTransactionHandler = async () => {
    if (!walletAddress) return;
    setAddingTransaction(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("No access token available");
      }

      const mockTransaction = {
        walletAddress,
        transactionType: "swap" as const,
        fromCurrency: "USDC",
        toCurrency: "NGN",
        amountSent: 100,
        amountReceived: 150000,
        fee: 1.5,
        recipient: {
          account_name: "John Doe",
          institution: "First Bank",
          account_identifier: "1234567890",
        },
        status: "completed" as const,
        txHash: "0x" + Math.random().toString(16).slice(2),
      };

      const response = await saveTransaction(mockTransaction, accessToken);
      if (response.success) {
        toast.success("Transaction added successfully");
        fetchTransactionData();
      } else {
        throw new Error(response.error || "Failed to add transaction");
      }
    } catch (error) {
      console.error("Error adding transaction:", error);

      toast.error("Failed to add transaction", {
        // @ts-ignore
        description: error?.response?.data?.error || "Something went wrong",
      });
    } finally {
      setAddingTransaction(false);
    }
  };

  useEffect(() => {
    if (walletAddress) {
      fetchTransactionData();
    }
  }, [walletAddress, page]);

  if (!walletAddress) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
        <p className="text-lg font-medium text-gray-900 dark:text-white">
          No wallet connected
        </p>
        <p className="mt-2 text-sm text-gray-500 dark:text-white/50">
          Please connect your wallet to view transactions
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl p-4">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Test Transactions
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-white/50">
            Using {isSmartWallet ? "smart wallet" : "embedded wallet"} address:{" "}
            {walletAddress}
          </p>
        </div>
        <button
          onClick={addMockTransactionHandler}
          disabled={addingTransaction}
          className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-white transition-all hover:bg-blue-600 disabled:opacity-50"
        >
          {addingTransaction ? (
            <>
              <PiSpinnerBold className="size-4 animate-spin" />
              Adding...
            </>
          ) : (
            "Add Mock Transaction"
          )}
        </button>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <PiSpinnerBold className="size-8 animate-spin text-gray-400" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-8 text-center dark:border-white/10 dark:bg-white/5">
            <p className="text-lg font-medium text-gray-900 dark:text-white">
              No transactions yet
            </p>
            <p className="text-sm text-gray-500 dark:text-white/50">
              Click "Add Mock Transaction" to create one
            </p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {transactions.map((tx) => (
              <motion.div
                key={tx.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {formatNumberWithCommas(tx.amount_sent)}{" "}
                      {tx.from_currency} →{" "}
                      {formatNumberWithCommas(tx.amount_received)}{" "}
                      {tx.to_currency}
                    </p>
                    <p className="mt-1 text-sm text-gray-500 dark:text-white/50">
                      To: {tx.recipient.account_name} (
                      {tx.recipient.institution})
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      tx.status === "completed"
                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                        : tx.status === "failed"
                          ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                          : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                    }`}
                  >
                    {tx.status}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-500 dark:text-white/50">
                  {new Date(tx.created_at).toLocaleString()}
                </p>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {total > limit && (
        <div className="mt-8 flex justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10"
          >
            Previous
          </button>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page * limit >= total || loading}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
