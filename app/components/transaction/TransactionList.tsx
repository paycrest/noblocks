"use client";
import { motion } from "framer-motion";
import Image from "next/image";
import { classNames, SUPPORTED_TOKENS } from "../../utils";
import type { Transaction } from "../../types";
import { useEffect, useState } from "react";
import { fetchTransactions } from "../../api/aggregator";
import { usePrivy } from "@privy-io/react-auth";
import { toast } from "sonner";
import { PiSpinnerBold } from "react-icons/pi";
import { useActualTheme } from "../../hooks/useActualTheme";

interface TransactionListProps {
  onSelectTransaction: (t: Transaction) => void;
}

const Divider = () => (
  <div className="w-full border border-dashed border-[#EBEBEF] dark:border-[#FFFFFF1A]" />
);

export const TransactionListItem = ({
  transaction,
  onClick,
}: {
  transaction: Transaction;
  onClick: () => void;
}) => {
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
                transaction.status === "completed"
                  ? "text-green-500"
                  : "text-red-500",
                "capitalize",
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

const getRelativeDate = (date: Date): string => {
  const now = new Date();
  const diffTime = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return "Today";
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} ${months === 1 ? "month" : "months"} ago`;
  } else {
    const years = Math.floor(diffDays / 365);
    return `${years} ${years === 1 ? "year" : "years"} ago`;
  }
};

export const TransactionList = ({
  onSelectTransaction,
}: TransactionListProps) => {
  const { user, getAccessToken } = usePrivy();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);

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

      const data = await fetchTransactions(walletAddress, accessToken);
      if (data.success) {
        setTransactions(data.data.transactions);
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
  }, [walletAddress]);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <PiSpinnerBold className="size-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-8 text-center dark:border-white/10 dark:bg-white/5">
        <p className="text-lg font-medium text-gray-900 dark:text-white">
          No transactions yet
        </p>
        <p className="text-sm text-gray-500 dark:text-white/50">
          Your transaction history will appear here
        </p>
      </div>
    );
  }

  // Group transactions by date
  const groupedTransactions = transactions.reduce(
    (groups, transaction) => {
      const date = new Date(transaction.created_at);
      const relativeDate = getRelativeDate(date);

      if (!groups[relativeDate]) {
        groups[relativeDate] = [];
      }
      groups[relativeDate].push(transaction);
      return groups;
    },
    {} as Record<string, Transaction[]>,
  );

  // Sort groups by date (most recent first)
  const sortedGroups = Object.entries(groupedTransactions).sort((a, b) => {
    const dateA = new Date(a[1][0].created_at);
    const dateB = new Date(b[1][0].created_at);
    return dateB.getTime() - dateA.getTime();
  });

  return (
    <div className="scrollbar-hide max-h-[80vh] w-full space-y-6 overflow-y-auto">
      {sortedGroups.map(([date, transactions]) => (
        <div key={date} className="space-y-3">
          <div className="flex items-center justify-between gap-x-6">
            <h3 className="whitespace-nowrap text-sm font-medium text-text-secondary dark:text-white/50">
              {date}
            </h3>
            <Divider />
          </div>
          <div className="space-y-2">
            {transactions.map((transaction) => (
              <TransactionListItem
                key={transaction.id}
                transaction={transaction}
                onClick={() => onSelectTransaction(transaction)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
