"use client";
import { motion } from "framer-motion";
import Image from "next/image";
import { classNames } from "../../utils";
import type { Transaction } from "../../types";
import { transactions } from "../../mocks";

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
}) => (
  <div
    onClick={onClick}
    className="group flex cursor-pointer items-center justify-between rounded-lg px-2 py-2 transition-all hover:bg-gray-50 dark:hover:bg-white/5"
  >
    <div className="flex items-center gap-2">
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-x-2">
          <Image
            src={`/logos/${String(transaction.currency)?.toLowerCase()}-logo.svg`}
            alt={transaction.currency}
            width={16}
            height={16}
            quality={90}
          />
          <span className="dark:text-white/80">
            {transaction.type} {transaction.amount} {transaction.currency}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-text-disabled dark:text-white/30">
            {transaction.time}
          </span>
          <span className="size-1 bg-icon-outline-disabled dark:bg-white/5"></span>
          <span
            className={classNames(
              transaction.status === "Completed"
                ? "text-green-500"
                : "text-red-500",
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
      {transaction.nativeValue}
    </motion.span>
  </div>
);

export const TransactionList = ({
  onSelectTransaction,
}: TransactionListProps) => (
  <div className="scrollbar-hide max-h-[80vh] space-y-6 overflow-y-auto">
    {transactions.map((group) => (
      <div key={group.id} className="space-y-3">
        <div className="flex items-center justify-between gap-x-6">
          <h3 className="whitespace-nowrap text-sm font-medium text-text-secondary dark:text-white/50">
            {group.date}
          </h3>
          <Divider />
        </div>
        <div className="space-y-2">
          {group.items.map((transaction: Transaction) => (
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
