"use client";
import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { toast } from "sonner";
import {
  fetchTransactions,
  saveTransaction,
  updateTransactionStatus,
} from "../api/aggregator";
import type {
  TransactionCreateInput,
  TransactionHistory,
  TransactionStatus,
} from "../types";
import { PiSpinnerBold } from "react-icons/pi";
import {
  formatNumberWithCommas,
  SUPPORTED_TOKENS,
  currencyToCountryCode,
  generatePaginationItems,
} from "../utils";
import { motion, AnimatePresence } from "framer-motion";
import { useConfetti } from "../hooks/useConfetti";
import Image from "next/image";
import { useActualTheme } from "../hooks/useActualTheme";
import axios from "axios";

const Divider = () => (
  <div className="w-full border border-dashed border-[#EBEBEF] dark:border-[#FFFFFF1A]" />
);

export default function TestTransactionsPage() {
  const { user, getAccessToken } = usePrivy();
  const [transactions, setTransactions] = useState<TransactionHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingTransaction, setAddingTransaction] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;
  const fireConfetti = useConfetti();
  const isDark = useActualTheme();
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

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

  const addMockTransactionHandler = async () => {
    if (!walletAddress) return;
    setAddingTransaction(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("No access token available");
      }

      // Generate random transaction data
      const cryptoCurrencies = ["USDC", "USDT", "DAI", "CNGN", "CELO"];
      const fiatCurrencies = ["NGN", "USD", "KES", "GHS"];
      const banks = [
        "First Bank",
        "Standard Bank",
        "Access Bank",
        "Zenith Bank",
        "UBA",
        "GTBank",
      ];
      const names = [
        "John Doe",
        "Jane Smith",
        "Alice Johnson",
        "Bob Williams",
        "Emma Brown",
        "Michael Davis",
      ];
      const memos = [
        "For Feeding",
        "School Fees",
        "Rent Payment",
        "Medical Bills",
        "Business Payment",
        "Family Support",
      ];

      const randomAmount = Math.floor(Math.random() * 1000) + 100;
      const randomReceived = Math.floor(Math.random() * 100000) + 10000;
      const randomFee = Math.floor(Math.random() * 100) + 10;
      const randomFromCurrency =
        cryptoCurrencies[Math.floor(Math.random() * cryptoCurrencies.length)];
      const randomToCurrency =
        fiatCurrencies[Math.floor(Math.random() * fiatCurrencies.length)];
      const randomBank = banks[Math.floor(Math.random() * banks.length)];
      const randomName = names[Math.floor(Math.random() * names.length)];
      const randomMemo = memos[Math.floor(Math.random() * memos.length)];
      const randomAccountId = Math.floor(Math.random() * 10000000000)
        .toString()
        .padStart(10, "0");
      const randomTimeSpent = Math.floor(Math.random() * 100) + 10;
      const randomTransactionType = Math.random() < 0.5 ? "transfer" : "swap";
      const statuses: TransactionStatus[] = [
        "refunded",
        "completed",
        "incomplete",
      ];
      const randomStatus =
        statuses[Math.floor(Math.random() * statuses.length)];

      const mockTransaction: TransactionCreateInput = {
        walletAddress,
        transactionType: randomTransactionType,
        fromCurrency: randomFromCurrency,
        toCurrency: randomToCurrency,
        amountSent: randomAmount,
        amountReceived: randomReceived,
        fee: randomFee,
        recipient: {
          account_name: randomName,
          institution: randomBank,
          account_identifier: randomAccountId,
          memo: randomMemo,
        },
        status: randomStatus,
        timeSpent: `${randomTimeSpent}s`,
        txHash: "0x" + Math.random().toString(16).slice(2),
      };

      const response = await saveTransaction(mockTransaction, accessToken);

      console.log(response.data.id);

      if (response.success) {
        toast.success("Transaction added successfully");
        fireConfetti();
        fetchTransactionData();
      } else {
        throw new Error("Failed to add transaction");
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

  const updateTransactionStatusHandler = async (
    transactionId: string,
    newStatus: string,
  ) => {
    if (!walletAddress) return;
    setUpdatingStatus(transactionId);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("No access token available");
      }

      const response = await updateTransactionStatus(
        transactionId,
        newStatus,
        accessToken,
        walletAddress,
      );

      if (response.success) {
        toast.success("Transaction status updated successfully");
        fetchTransactionData();
      } else {
        throw new Error("Failed to update status");
      }
    } catch (error) {
      console.error("Error updating transaction status:", error);
      toast.error("Failed to update transaction status", {
        // @ts-ignore
        description: error?.response?.data?.error || "Something went wrong",
      });
    } finally {
      setUpdatingStatus(null);
    }
  };

  const updateTransactionDataHandler = async (
    transactionId: string,
    txHash: string,
    timeSpent: string,
    status: string,
  ) => {
    if (!walletAddress) return;
    setUpdatingStatus(transactionId);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("No access token available");
      }

      const response = await axios.put(
        `/api/v1/transactions/${transactionId}`,
        {
          txHash,
          timeSpent,
          status,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "x-wallet-address": walletAddress.toLowerCase(),
          },
        },
      );

      if (response.data.success) {
        toast.success("Transaction data updated successfully");
        fetchTransactionData();
      } else {
        throw new Error("Failed to update transaction data");
      }
    } catch (error) {
      console.error("Error updating transaction data:", error);
      toast.error("Failed to update transaction data", {
        // @ts-ignore
        description: error?.response?.data?.error || "Something went wrong",
      });
    } finally {
      setUpdatingStatus(null);
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
            Using embedded wallet address: {walletAddress}
          </p>
        </div>
        <button
          type="button"
          onClick={addMockTransactionHandler}
          disabled={addingTransaction}
          className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-white transition-all hover:bg-blue-600 disabled:opacity-50"
          aria-label="Add mock transaction"
        >
          {addingTransaction ? (
            <>
              <PiSpinnerBold
                className="size-4 animate-spin"
                aria-hidden="true"
              />
              Adding...
            </>
          ) : (
            "Add Mock Transaction"
          )}
        </button>
      </div>

      <div className="mb-4 flex gap-4">
        <button
          onClick={() => {
            if (transactions.length > 0) {
              const tx = transactions[0];
              updateTransactionDataHandler(
                tx.id,
                "0x" + Math.random().toString(16).slice(2),
                `${Math.floor(Math.random() * 100) + 10}s`,
                tx.status,
              );
            }
          }}
          disabled={transactions.length === 0 || !walletAddress}
          className="rounded-lg bg-green-500 px-4 py-2 text-white hover:bg-green-600 disabled:bg-gray-400"
        >
          Update First Transaction Data
        </button>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <PiSpinnerBold
              className="size-8 animate-spin text-gray-400"
              aria-label="Loading transactions"
            />
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
            {transactions.map((tx) => {
              const tokenKey =
                tx.from_currency.toUpperCase() as keyof typeof SUPPORTED_TOKENS;
              const tokenLogo = SUPPORTED_TOKENS[tokenKey] || "usdc";
              const toCountryCode = currencyToCountryCode(tx.to_currency);

              return (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="group flex cursor-pointer items-start justify-between rounded-xl px-2 py-2 transition-all hover:bg-gray-50 dark:hover:bg-white/5"
                >
                  <div className="flex items-center gap-2">
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center gap-x-2">
                        <Image
                          src={
                            tokenLogo === "lisk"
                              ? isDark
                                ? "/logos/lisk-logo-dark.svg"
                                : "/logos/lisk-logo-light.svg"
                              : `/logos/${tokenLogo}-logo.svg`
                          }
                          alt={tx.from_currency}
                          width={16}
                          height={16}
                          quality={90}
                        />
                        <span className="capitalize dark:text-white/80">
                          {tx.transaction_type}{" "}
                          {formatNumberWithCommas(tx.amount_sent)}{" "}
                          {tx.from_currency}
                        </span>
                      </div>
                      <div className="flex items-center gap-x-2">
                        <span className="text-text-disabled dark:text-white/30">
                          {new Date(tx.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <span className="size-1 bg-icon-outline-disabled dark:bg-white/5"></span>
                        <div className="flex items-center gap-2">
                          <span
                            className={`${
                              tx.status === "completed"
                                ? "text-green-500"
                                : "text-red-500"
                            } capitalize`}
                          >
                            {tx.status}
                          </span>
                          {updatingStatus === tx.id ? (
                            <PiSpinnerBold className="size-4 animate-spin" />
                          ) : (
                            <select
                              value={tx.status}
                              onChange={(e) =>
                                updateTransactionStatusHandler(
                                  tx.id,
                                  e.target.value,
                                )
                              }
                              className="rounded border border-gray-200 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-white/5"
                              disabled={updatingStatus === tx.id}
                              aria-label={`Update status for transaction ${tx.id}`}
                            >
                              <option value="incomplete">Incomplete</option>
                              <option value="fulfilled">Fulfilled</option>
                              <option value="completed">Completed</option>
                              <option value="refunded">Refunded</option>
                            </select>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <motion.div
                    className="flex items-center gap-2 text-sm text-text-secondary dark:text-white/50"
                    initial={{ x: 0 }}
                    whileHover={{ x: -4 }}
                    transition={{ duration: 0.2 }}
                  >
                    <span>
                      {formatNumberWithCommas(tx.amount_received)}{" "}
                      {tx.to_currency}
                    </span>
                  </motion.div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {transactions.length > 0 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="rounded-lg border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10"
            aria-label="Go to previous page"
          >
            Previous
          </button>

          <div
            className="flex items-center gap-1"
            role="navigation"
            aria-label="Pagination"
          >
            {generatePaginationItems(page, Math.ceil(total / limit)).map(
              (item, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => {
                    if (typeof item === "number") {
                      setPage(item);
                    }
                  }}
                  disabled={loading || item === "..."}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition-all ${
                    item === page
                      ? "bg-blue-500 text-white"
                      : item === "..."
                        ? "cursor-default text-gray-400"
                        : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10"
                  }`}
                  aria-label={
                    item === "..." ? "More pages" : `Go to page ${item}`
                  }
                  aria-current={item === page ? "page" : undefined}
                >
                  {item}
                </button>
              ),
            )}
          </div>

          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={page * limit >= total || loading}
            className="rounded-lg border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10"
            aria-label="Go to next page"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
