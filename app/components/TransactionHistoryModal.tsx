import { Dialog, DialogPanel } from "@headlessui/react";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Cancel01Icon, ArrowLeft02Icon } from "hugeicons-react";
import Image from "next/image";
import { classNames } from "../utils";
import Link from "next/link";
import { transactions } from "../mocks";
import { slideUpAnimation } from "./AnimatedComponents";
import { ImSpinner } from "react-icons/im";

interface TransactionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Transaction {
  id: string;
  type: string;
  amount: string;
  currency: string;
  nativeValue: string;
  time: string;
  status: string;
  fees?: string;
  day?: string;
  recipient?: string;
  bank?: string;
  account?: string;
  memo?: string;
  fundStatus?: string;
  timeSpent?: string;
}

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
                className="w-full sm:w-auto sm:max-w-md"
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
                          <button
                            type="button"
                            title="Back"
                            onClick={() => setSelectedTransaction(null)}
                            className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10 max-sm:-ml-2"
                          >
                            <ArrowLeft02Icon className="size-5 text-outline-gray dark:text-white/50" />
                          </button>
                          <h2 className="text-lg font-semibold text-text-body dark:text-white">
                            Details
                          </h2>
                          <button
                            type="button"
                            title="Close"
                            onClick={onClose}
                            className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10"
                          >
                            <Cancel01Icon className="size-5 text-outline-gray dark:text-white/50" />
                          </button>
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
                          <button
                            type="button"
                            aria-label="Close modal"
                            onClick={onClose}
                            className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10 max-sm:-ml-2 sm:hidden"
                          >
                            <ArrowLeft02Icon className="size-5 text-outline-gray dark:text-white/50" />
                          </button>
                          <h2 className="text-lg font-semibold text-text-body dark:text-white sm:flex-1">
                            Transactions
                          </h2>
                          <button
                            type="button"
                            title="Close"
                            onClick={onClose}
                            className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10"
                          >
                            <Cancel01Icon className="size-5 text-outline-gray dark:text-white/50" />
                          </button>
                        </div>

                        <div className="scrollbar-hide max-h-[80vh] overflow-y-auto pb-4">
                          {transactions.map((group) => (
                            <div key={group.id} className="space-y-3">
                              <div className="flex items-center justify-between gap-x-6">
                                <h3 className="text-sm font-medium text-text-secondary dark:text-white/50">
                                  {group.date}
                                </h3>
                                <div className="w-2/3 border border-dashed border-[#EBEBEF] dark:border-[#FFFFFF1A]" />
                              </div>
                              <div className="space-y-2">
                                {group.items.map((transaction) => (
                                  <div
                                    key={transaction.id}
                                    onClick={() =>
                                      setSelectedTransaction(transaction)
                                    }
                                    className="flex cursor-pointer items-center justify-between py-2"
                                  >
                                    {/* Transaction row content */}
                                    <div className="flex items-center gap-2">
                                      {/* Icon based on currency */}
                                      <div className="text-sm">
                                        <div className="flex items-center gap-x-2">
                                          <Image
                                            src={`/logos/${String(transaction.currency)?.toLowerCase()}-logo.svg`}
                                            alt={transaction.currency}
                                            width={12.02}
                                            height={11.54}
                                            quality={90}
                                          />
                                          <span>
                                            {transaction.type}{" "}
                                            {transaction.amount}{" "}
                                            {transaction.currency}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <span className="text-xs text-text-disabled dark:text-white/30">
                                            {transaction.time}
                                          </span>
                                          <span
                                            className={classNames(
                                              "text-xs",
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
                                    <span className="text-sm text-text-secondary dark:text-white/50">
                                      {transaction.nativeValue}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
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

const TransactionDetails = ({ transaction }: { transaction: Transaction }) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleGetReceipt = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      console.log("Receipt generated for", transaction.id);
    }, 1500);
  };

  return (
    <div className="space-y-4">
      <div className="mt-4 flex items-center gap-2">
        <div className="relative">
          <Image
            src={
              transaction?.currency === "USDC"
                ? "/logos/usdc-logo.svg"
                : "/logos/usdt-logo.svg"
            }
            alt={transaction.currency}
            width={20}
            height={20}
            quality={90}
            className="rounded-full"
          />
          <div className="absolute -right-[76%] -top-[1px] z-10 h-fit w-fit rounded-full border-[2px] border-white dark:border-surface-overlay">
            <Image
              src={
                transaction?.currency === "USDC"
                  ? "/logos/usdt-logo.svg"
                  : "/logos/usdc-logo.svg"
              }
              alt={transaction.currency}
              width={20}
              height={20}
              quality={90}
              className="rounded-full"
            />
          </div>
        </div>
        <span className="ml-2 text-base font-medium dark:text-white">
          Swapped {transaction.amount} {transaction.currency}
        </span>
      </div>

      <p
        className={classNames(
          "text-xs",
          transaction.status === "Completed"
            ? "text-green-500"
            : "text-red-500",
        )}
      >
        {transaction.status}
      </p>

      <div className="space-y-0 pt-4">
        <div className="flex justify-between border-b border-gray-700/10 py-[14px] dark:border-white/10">
          <span className="text-sm text-gray-500 dark:text-white/50">
            Amount
          </span>
          <span className="text-sm dark:text-white">
            {transaction.nativeValue}
          </span>
        </div>

        <div className="flex justify-between border-b border-gray-700/10 py-[14px] dark:border-white/10">
          <span className="text-sm text-gray-500 dark:text-white/50">Fees</span>
          <span className="text-sm dark:text-white">{transaction.fees}</span>
        </div>

        <div className="flex justify-between border-b border-gray-700/10 py-[14px] dark:border-white/10">
          <span className="text-sm text-gray-500 dark:text-white/50">
            Recipient
          </span>
          <span className="text-sm dark:text-white">
            {transaction.recipient}
          </span>
        </div>

        <div className="flex justify-between border-b border-gray-700/10 py-[14px] dark:border-white/10">
          <span className="text-sm text-gray-500 dark:text-white/50">Bank</span>
          <span className="text-sm dark:text-white">{transaction.bank}</span>
        </div>

        <div className="flex justify-between border-b border-gray-700/10 py-[14px] dark:border-white/10">
          <span className="text-sm text-gray-500 dark:text-white/50">
            Account
          </span>
          <span className="text-sm dark:text-white">{transaction.account}</span>
        </div>

        <div className="flex justify-between border-b border-gray-700/10 py-[14px] dark:border-white/10">
          <span className="text-sm text-gray-500 dark:text-white/50">Memo</span>
          <span className="text-sm dark:text-white">{transaction.memo}</span>
        </div>

        <div className="flex justify-between border-b border-gray-700/10 py-[14px] dark:border-white/10">
          <span className="text-sm text-gray-500 dark:text-white/50">Date</span>
          <span className="text-sm dark:text-white">
            {transaction.time} 1{transaction.day}
          </span>
        </div>

        <div className="flex justify-between border-b border-gray-700/10 py-[14px] dark:border-white/10">
          <span className="text-sm text-gray-500 dark:text-white/50">
            Transaction status
          </span>
          <span className="text-sm dark:text-white">{transaction.status}</span>
        </div>

        <div className="flex justify-between border-b border-gray-700/10 py-[14px] dark:border-white/10">
          <span className="text-sm text-gray-500 dark:text-white/50">
            Fund status
          </span>
          <span className="text-sm dark:text-white">Deposited</span>
        </div>

        <div className="flex justify-between border-b border-gray-700/10 py-[14px] dark:border-white/10">
          <span className="text-sm text-gray-500 dark:text-white/50">
            Time spent
          </span>
          <span className="text-sm dark:text-white">
            {transaction.timeSpent}
          </span>
        </div>

        <div className="flex justify-between py-[14px]">
          <span className="text-sm text-gray-500 dark:text-white/50">
            Onchain receipt
          </span>
          <Link href="#" className="text-sm text-[#8B85F4]">
            View in explorer
          </Link>
        </div>
      </div>

      <div className="mt-4">
        <button
          onClick={handleGetReceipt}
          disabled={isLoading}
          className="w-full rounded-xl bg-[#F7F7F8] py-3 font-medium text-[#121217] transition hover:bg-[#F7F7F8] focus:outline-none disabled:opacity-70 dark:bg-[#363636] dark:text-white dark:hover:bg-[#363636]/50"
        >
          {isLoading ? (
            <div className="flex items-center justify-center gap-2">
              <ImSpinner className="size-4 animate-spin text-white" />

              <span>Generating receipt...</span>
            </div>
          ) : (
            "Get receipt"
          )}
        </button>
      </div>
    </div>
  );
};
