import { Dialog, DialogPanel } from "@headlessui/react";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Cancel01Icon, ArrowLeft02Icon } from "hugeicons-react";
import Image from "next/image";
import { classNames } from "../utils";
import Link from "next/link";

interface TransactionModalProps {
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

export const TransactionModal = ({ isOpen, onClose }: TransactionModalProps) => {
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  const transactions = [
    {
      id: "1",
      date: "Today",
      items: [
        {
            id: "t1",
            type: "Swapped",
            amount: "28.10",
            currency: "USDC",
            nativeValue: "NGN 369,723.88",
            time: "4:14 AM",
            status: "Completed",
            fees: "NGN 2,392",
            recipient: "Francesca Tobiloba",
            bank: "First Bank of Nigeria",
            account: "0267856481",
            memo: "From me, Donda North",
            fundStatus: "Deposited",
            timeSpent: "12 seconds",
            day: "13 May 2024"
        },
        {
          id: "t2",
          type: "Swapped",
          amount: "15.50",
          currency: "USDT",
          nativeValue: "NGN 5,672.15",
          time: "8:45 PM",
          status: "Completed",
          fees: "NGN 2,392",
            recipient: "Francesca Tobiloba",
            bank: "First Bank of Nigeria",
            account: "0267856481",
            memo: "From me, Donda North",
            fundStatus: "Deposited",
            timeSpent: "12 seconds",
            day: "13 May 2024"
        },
        {
          id: "t3",
          type: "Swapped",
          amount: "100.00",
          currency: "USDT",
          nativeValue: "KES 45,678.90",
          time: "2:20 PM",
          status: "Failed",
          fees: "NGN 2,392",
            recipient: "Francesca Tobiloba",
            bank: "First Bank of Nigeria",
            account: "0267856481",
            memo: "From me, Donda North",
            fundStatus: "Deposited",
            timeSpent: "12 seconds",
            day: "13 May 2024"
        },
      ],
    },
    {
      id: "2",
      date: "Yesterday",
      items: [
        {
          id: "t4",
          type: "Swapped",
          amount: "28.10",
          currency: "USDC",
          nativeValue: "NGN 369,723.88",
          time: "4:14 AM",
          status: "Completed",
          fees: "NGN 2,392",
            recipient: "Francesca Tobiloba",
            bank: "First Bank of Nigeria",
            account: "0267856481",
            memo: "From me, Donda North",
            fundStatus: "Deposited",
            timeSpent: "12 seconds",
            day: "13 May 2024"

        },
        {
          id: "t5",
          type: "Swapped",
          amount: "15.50",
          currency: "USDT",
          nativeValue: "ARS 82,506.45",
          time: "6:30 PM",
          status: "Completed",
          fees: "NGN 2,392",
            recipient: "Francesca Tobiloba",
            bank: "First Bank of Nigeria",
            account: "0267856481",
            memo: "From me, Donda North",
            fundStatus: "Deposited",
            timeSpent: "12 seconds",
            day: "13 May 2024"

        },
        {
          id: "t6",
          type: "Swapped",
          amount: "200.00",
          currency: "USDT",
          nativeValue: "KES 7,890.65",
          time: "8:00 AM",
          status: "Completed",
          fees: "NGN 2,392",
            recipient: "Francesca Tobiloba",
            bank: "First Bank of Nigeria",
            account: "0267856481",
            memo: "From me, Donda North",
            fundStatus: "Deposited",
            timeSpent: "12 seconds",
            day: "13 May 2024"

        },
        {
          id: "t7",
          type: "Swapped",
          amount: "75.30",
          currency: "USDC",
          nativeValue: "NGN 53,674.20",
          time: "5:55 PM",
          status: "Failed",
          fees: "NGN 2,392",
            recipient: "Francesca Tobiloba",
            bank: "First Bank of Nigeria",
            account: "0267856481",
            memo: "From me, Donda North",
            fundStatus: "Deposited",
            timeSpent: "12 seconds",
            day: "13 May 2024"

        },
      ],
    },
    {
      id: "3",
      date: "2 days ago",
      items: [
        {
          id: "t8",
          type: "Swapped",
          amount: "28.10",
          currency: "USDC",
          nativeValue: "NGN 369,723.88",
          time: "4:14 AM",
          status: "Completed",
          fees: "NGN 2,392",
            recipient: "Francesca Tobiloba",
            bank: "First Bank of Nigeria",
            account: "0267856481",
            memo: "From me, Donda North",
            fundStatus: "Deposited",
            timeSpent: "12 seconds",
            day: "13 May 2024"

        },
      ],
    },
  ];

  const slideUpAnimation = {
    initial: { y: "100%", opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: "100%", opacity: 0 },
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 30,
      duration: 0.2,
    },
  };

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
              <motion.div {...slideUpAnimation} className="w-full sm:w-auto sm:max-w-md">
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

                        <div className="max-h-[80vh] overflow-y-auto pb-4 scrollbar-hide">
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

                        <div className="max-h-[80vh] overflow-y-auto pb-4 scrollbar-hide">
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
                                            src={
                                              transaction?.currency === "USDC"
                                                ? "/logos/usdc-logo.svg"
                                                : "/logos/usdt-logo.svg"
                                            }
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
      <div className="space-y-4 ">
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
            <div className="absolute -top-[1px] -right-[76%] z-10 w-fit h-fit rounded-full border-[2px] border-white dark:border-surface-overlay ">
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
          <span className="text-base font-medium dark:text-white ml-2">
            Swapped {transaction.amount} {transaction.currency}
          </span>
        </div>
        
        <p className={classNames(
                                              "text-xs",
                                              transaction.status === "Completed"
                                                ? "text-green-500"
                                                : "text-red-500",
                                            )}>
          {transaction.status}
        </p>
  
        <div className="space-y-0 pt-4">
          <div className="flex justify-between border-b border-gray-700/10 py-[14px] dark:border-white/10">
            <span className="text-sm text-gray-500 dark:text-white/50">Amount</span>
            <span className="text-sm dark:text-white">{transaction.nativeValue}</span>
          </div>
          
          <div className="flex justify-between border-b border-gray-700/10 py-[14px] dark:border-white/10">
            <span className="text-sm text-gray-500 dark:text-white/50">Fees</span>
            <span className="text-sm dark:text-white">{transaction.fees}</span>
          </div>
          
          <div className="flex justify-between border-b border-gray-700/10 py-[14px] dark:border-white/10">
            <span className="text-sm text-gray-500 dark:text-white/50">Recipient</span>
            <span className="text-sm dark:text-white">{transaction.recipient}</span>
          </div>
          
          <div className="flex justify-between border-b border-gray-700/10 py-[14px] dark:border-white/10">
            <span className="text-sm text-gray-500 dark:text-white/50">Bank</span>
            <span className="text-sm dark:text-white">{transaction.bank}</span>
          </div>
          
          <div className="flex justify-between border-b border-gray-700/10 py-[14px] dark:border-white/10">
            <span className="text-sm text-gray-500 dark:text-white/50">Account</span>
            <span className="text-sm dark:text-white">{transaction.account}</span>
          </div>
          
          <div className="flex justify-between border-b border-gray-700/10 py-[14px] dark:border-white/10">
            <span className="text-sm text-gray-500 dark:text-white/50">Memo</span>
            <span className="text-sm dark:text-white">{transaction.memo}</span>
          </div>
          
          <div className="flex justify-between border-b border-gray-700/10 py-[14px] dark:border-white/10">
            <span className="text-sm text-gray-500 dark:text-white/50">Date</span>
            <span className="text-sm dark:text-white">{transaction.time} 1{transaction.day}</span>
          </div>
          
          <div className="flex justify-between border-b border-gray-700/10 py-[14px] dark:border-white/10">
            <span className="text-sm text-gray-500 dark:text-white/50">Transaction status</span>
            <span className="text-sm dark:text-white">{transaction.status}</span>
          </div>
          
          <div className="flex justify-between border-b border-gray-700/10 py-[14px] dark:border-white/10">
            <span className="text-sm text-gray-500 dark:text-white/50">Fund status</span>
            <span className="text-sm dark:text-white">Deposited</span>
          </div>
          
          <div className="flex justify-between border-b border-gray-700/10 py-[14px] dark:border-white/10">
            <span className="text-sm text-gray-500 dark:text-white/50">Time spent</span>
            <span className="text-sm dark:text-white">{transaction.timeSpent}</span>
          </div>
          
          <div className="flex justify-between py-[14px]">
            <span className="text-sm text-gray-500 dark:text-white/50">Onchain receipt</span>
            <Link href="#" className="text-sm text-[#8B85F4]">View in explorer</Link>
          </div>
        </div>
  
        <div className="mt-4">
          <button
            onClick={handleGetReceipt}
            disabled={isLoading}
            className="w-full rounded-xl bg-[#F7F7F8] py-3 font-medium text-[#121217] dark:text-white transition hover:bg-[#F7F7F8] focus:outline-none disabled:opacity-70 dark:bg-[#363636] dark:hover:bg-[#363636]/50"
          >
            {isLoading ? (
              <div className="flex items-center justify-center gap-2">
                <svg
                  className="h-4 w-4 animate-spin text-white"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
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