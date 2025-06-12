"use client";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import {
  classNames,
  SUPPORTED_TOKENS,
  generatePaginationItems,
  getRelativeDate,
} from "../../utils";
import type { TransactionHistory } from "../../types";
import { useEffect, useMemo } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { PiSpinnerBold } from "react-icons/pi";
import { useActualTheme } from "../../hooks/useActualTheme";
import { useTransactions } from "../../context/TransactionsContext";
import {
  ArrowLeft02Icon,
  ArrowRight02Icon,
  Invoice01Icon,
} from "hugeicons-react";
import { fadeInOut } from "../AnimatedComponents";

interface TransactionListProps {
  onSelectTransaction?: (transaction: TransactionHistory) => void;
}

// Divider component for visual separation
const Divider = () => (
  <div className="w-full border border-dashed border-[#EBEBEF] dark:border-[#FFFFFF1A]" />
);

// Add status color mapping
const STATUS_COLOR_MAP: Record<string, string> = {
  completed: "text-green-500",
  refunded: "text-red-500",
  fulfilled: "text-blue-500",
  pending: "text-orange-500",
  processing: "text-yellow-500",
};

// Individual transaction list item component
export const TransactionListItem = ({
  transaction,
  onClick,
}: {
  transaction: TransactionHistory;
  onClick: () => void;
}) => {
  // Get token logo based on currency
  const tokenKey =
    transaction.from_currency.toUpperCase() as keyof typeof SUPPORTED_TOKENS;
  const tokenLogo = SUPPORTED_TOKENS[tokenKey] || "usdc";
  const isDark = useActualTheme();

  return (
    <div
      onClick={onClick}
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
              alt={transaction.from_currency}
              width={16}
              height={16}
              quality={90}
            />
            <span className="capitalize dark:text-white/80">
              {transaction.transaction_type} {transaction.amount_sent}{" "}
              {transaction.from_currency}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-text-disabled dark:text-white/30">
              {new Date(transaction.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="size-1 bg-icon-outline-disabled dark:bg-white/5"></span>
            <span
              className={classNames(
                STATUS_COLOR_MAP[transaction.status] ||
                  "text-text-secondary dark:text-white/50",
              )}
            >
              {transaction.status}
            </span>
          </div>
        </div>
      </div>
      <motion.span
        className="text-sm text-text-secondary dark:text-white/50"
        initial={{ x: 0 }}
        whileHover={{ x: -4 }}
        transition={{ duration: 0.2 }}
      >
        {transaction.amount_received.toLocaleString()} {transaction.to_currency}
      </motion.span>
    </div>
  );
};

// Main TransactionList component
export default function TransactionList({
  onSelectTransaction,
}: TransactionListProps) {
  const { user, getAccessToken } = usePrivy();
  const limit = 30;
  const isDark = useActualTheme();

  // Get embedded wallet address
  const embeddedWallet = user?.linkedAccounts.find(
    (account) =>
      account.type === "wallet" && account.connectorType === "embedded",
  ) as { address: string } | undefined;

  const walletAddress = embeddedWallet?.address;

  // Use the transactions context
  const {
    transactions,
    total,
    isLoading,
    error,
    currentPage,
    fetchTransactions,
    setPage,
  } = useTransactions();

  // Fetch transactions when wallet address or page changes
  useEffect(() => {
    if (walletAddress) {
      getAccessToken().then((accessToken) => {
        if (accessToken) {
          fetchTransactions(walletAddress, accessToken, currentPage, limit);
        }
      });
    }
  }, [walletAddress, currentPage, fetchTransactions, getAccessToken]);

  // Group transactions by date
  const groupedTransactions = useMemo(() => {
    const groups = transactions.reduce(
      (acc, transaction) => {
        const date = new Date(transaction.created_at);
        const relativeDate = getRelativeDate(date);

        if (!acc[relativeDate]) {
          acc[relativeDate] = [];
        }
        acc[relativeDate].push(transaction);
        return acc;
      },
      {} as Record<string, TransactionHistory[]>,
    );

    // Sort groups by date (most recent first)
    return Object.entries(groups).sort((a, b) => {
      const dateA = new Date(a[1][0].created_at);
      const dateB = new Date(b[1][0].created_at);
      return dateB.getTime() - dateA.getTime();
    });
  }, [transactions]);

  // Show message if no wallet is connected
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
    <div className="flex h-full w-full flex-col space-y-4">
      {/* Loading state */}
      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <PiSpinnerBold
            className="size-8 animate-spin text-gray-400"
            aria-label="Loading transactions"
          />
        </div>
      ) : transactions.length === 0 ? (
        // Empty state
        <motion.div
          {...fadeInOut}
          className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center dark:border-white/10 dark:bg-white/5"
        >
          <Invoice01Icon className="size-6 text-gray-400 dark:text-white/30" />
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            No transactions yet
          </p>
          <p className="text-sm text-gray-500 dark:text-white/50">
            Your transaction history will appear here
          </p>
        </motion.div>
      ) : (
        <div className="scrollbar-hide max-h-[80vh] w-full space-y-6 overflow-y-auto">
          <AnimatePresence mode="popLayout">
            {groupedTransactions.map(([date, transactions]) => (
              <motion.div
                key={date}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-3"
              >
                <div className="flex items-center justify-between gap-x-6">
                  <h3 className="whitespace-nowrap text-sm font-medium text-text-secondary dark:text-white/50">
                    {date}
                  </h3>
                  <Divider />
                </div>
                <div className="space-y-2">
                  {transactions.map((transaction) => {
                    const tokenKey =
                      transaction.from_currency.toUpperCase() as keyof typeof SUPPORTED_TOKENS;
                    const tokenLogo = SUPPORTED_TOKENS[tokenKey] || "usdc";

                    return (
                      <motion.div
                        key={transaction.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="group flex cursor-pointer items-start justify-between rounded-xl px-2 py-2 transition-all hover:bg-gray-50 dark:hover:bg-white/5"
                        onClick={() => onSelectTransaction?.(transaction)}
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
                                alt={transaction.from_currency}
                                width={16}
                                height={16}
                                quality={90}
                                className="rounded-full"
                              />
                              <span className="capitalize dark:text-white/80">
                                {transaction.transaction_type === "transfer"
                                  ? "Transferred"
                                  : transaction.transaction_type === "swap"
                                    ? "Swapped"
                                    : transaction.transaction_type}{" "}
                                {transaction.amount_sent.toLocaleString()}{" "}
                                {transaction.from_currency}
                              </span>
                            </div>
                            <div className="flex items-center gap-x-2">
                              <span className="text-text-disabled dark:text-white/30">
                                {new Date(
                                  transaction.created_at,
                                ).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              <span className="size-1 bg-icon-outline-disabled dark:bg-white/5"></span>
                              <span
                                className={classNames(
                                  STATUS_COLOR_MAP[transaction.status] ||
                                    "text-text-secondary dark:text-white/50",
                                )}
                              >
                                {transaction.status}
                              </span>
                            </div>
                          </div>
                        </div>

                        <span className="text-sm text-text-secondary dark:text-white/50">
                          {transaction.amount_received.toLocaleString()}{" "}
                          {transaction.to_currency}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Pagination controls */}
      {transactions.length > 0 && Math.ceil(total / limit) > 1 && (
        <div className="mt-8 flex flex-grow items-end justify-center gap-2">
          <button
            type="button"
            onClick={() => setPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1 || isLoading}
            className="size-8 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10"
            aria-label="Go to previous page"
          >
            <ArrowLeft02Icon className="mx-auto size-4" />
          </button>

          <div
            className="flex items-center gap-1"
            role="navigation"
            aria-label="Pagination"
          >
            {generatePaginationItems(currentPage, Math.ceil(total / limit)).map(
              (item, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => typeof item === "number" && setPage(item)}
                  disabled={isLoading || item === "..."}
                  className={classNames(
                    "flex size-8 items-center justify-center rounded-lg text-sm font-medium transition-all",
                    item === currentPage
                      ? "bg-secondary text-white hover:bg-secondary/80"
                      : item === "..."
                        ? "cursor-default text-gray-400"
                        : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10",
                  )}
                  aria-label={
                    item === "..." ? "More pages" : `Go to page ${item}`
                  }
                  aria-current={item === currentPage ? "page" : undefined}
                >
                  {item}
                </button>
              ),
            )}
          </div>

          <button
            type="button"
            onClick={() => setPage(currentPage + 1)}
            disabled={currentPage * limit >= total || isLoading}
            className="size-8 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10"
            aria-label="Go to next page"
          >
            <ArrowRight02Icon className="mx-auto size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
