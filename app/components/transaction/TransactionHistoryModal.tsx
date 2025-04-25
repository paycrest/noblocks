"use client";
import { Dialog, DialogPanel } from "@headlessui/react";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Cancel01Icon, ArrowLeft02Icon } from "hugeicons-react";
import { slideUpAnimation } from "../AnimatedComponents";
import { TransactionList } from "./TransactionList";
import { TransactionDetails } from "./TransactionDetails";
import type { Transaction } from "./types";

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
    useState<Transaction | null>(null);

  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog open={isOpen} onClose={onClose} className="relative z-50">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm"
          />

          <div className="fixed inset-0">
            <div className="flex h-full items-end sm:items-center sm:justify-center">
              <motion.div
                {...slideUpAnimation}
                className="w-full sm:hidden sm:max-w-md"
              >
                <DialogPanel className="relative w-full overflow-visible rounded-t-[30px] border border-border-light bg-white px-5 pb-12 pt-6 shadow-xl *:text-sm dark:border-white/5 dark:bg-surface-overlay sm:rounded-[20px]">
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
                            onClick={onClose}
                            icon={
                              <Cancel01Icon className="size-5 text-outline-gray dark:text-white/50" />
                            }
                            label="Close"
                          />
                        </div>

                        <div className="scrollbar-hide max-h-[80vh] overflow-y-auto pb-4">
                          <TransactionDetails
                            transaction={selectedTransaction}
                          />
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
                          <HeaderButton
                            onClick={onClose}
                            icon={
                              <ArrowLeft02Icon className="size-5 text-outline-gray dark:text-white/50" />
                            }
                            label="Close modal"
                          />
                          <h2 className="text-lg font-semibold text-text-body dark:text-white sm:flex-1">
                            Transactions
                          </h2>
                          <HeaderButton
                            onClick={onClose}
                            icon={
                              <Cancel01Icon className="size-5 text-outline-gray dark:text-white/50" />
                            }
                            label="Close"
                          />
                        </div>

                        <TransactionList
                          onSelectTransaction={setSelectedTransaction}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </DialogPanel>
              </motion.div>
            </div>
          </div>
        </Dialog>
      )}
    </AnimatePresence>
  );
};
