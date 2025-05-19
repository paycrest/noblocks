"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useState, useEffect } from "react";
import { Cancel01Icon, ArrowLeft02Icon } from "hugeicons-react";
import { AnimatedModal } from "../AnimatedComponents";
import { TransactionDetails } from "./TransactionDetails";
import type { TransactionHistory } from "../../types";
import TransactionList from "./TransactionList";
import { useTransactions } from "../../context/TransactionsContext";

interface TransactionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const HeaderButton = ({
  onClick,
  icon,
  label,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) => (
  <button
    type="button"
    title={label}
    onClick={onClick}
    className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10"
  >
    {icon}
  </button>
);

export const TransactionHistoryModal = ({
  isOpen,
  onClose,
}: TransactionHistoryModalProps) => {
  const [selectedTransaction, setSelectedTransaction] =
    useState<TransactionHistory | null>(null);
  const { clearTransactions } = useTransactions();

  const handleClose = () => {
    setSelectedTransaction(null);
    onClose();
  };

  // Clear transactions when modal is closed
  useEffect(() => {
    if (!isOpen) {
      clearTransactions();
    }
  }, [isOpen, clearTransactions]);

  return (
    <AnimatedModal isOpen={isOpen} onClose={handleClose}>
      <AnimatePresence mode="wait">
        {selectedTransaction ? (
          <motion.div
            key="transaction-details"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <HeaderButton
                onClick={() => setSelectedTransaction(null)}
                icon={
                  <ArrowLeft02Icon className="size-5 text-outline-gray dark:text-white/50" />
                }
                label="Back"
              />
              <h2 className="text-lg font-semibold text-text-body dark:text-white">
                Details
              </h2>
              <HeaderButton
                onClick={handleClose}
                icon={
                  <Cancel01Icon className="size-5 text-outline-gray dark:text-white/50" />
                }
                label="Close"
              />
            </div>

            <div className="scrollbar-hide max-h-[80vh] w-full overflow-y-auto pb-4">
              <TransactionDetails transaction={selectedTransaction} />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="transaction-list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-body dark:text-white">
                Transaction History
              </h2>
              <HeaderButton
                onClick={handleClose}
                icon={
                  <Cancel01Icon className="size-5 text-outline-gray dark:text-white/50" />
                }
                label="Close"
              />
            </div>

            <TransactionList onSelectTransaction={setSelectedTransaction} />
          </motion.div>
        )}
      </AnimatePresence>
    </AnimatedModal>
  );
};
