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
import { pdf } from "@react-pdf/renderer";
import { PDFReceipt } from "./PDFReceipt";
import { toast } from "sonner";

interface TransactionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Transaction {
  id: string;
  type: string;
  amount: string;
  currency: string;
  swappedCurrency?: string;
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

const DetailRow = ({
  label,
  value,
  linkHref,
}: {
  label: string;
  value: React.ReactNode;
  linkHref?: string;
}) => (
  <div className="flex justify-between py-[14px] dark:border-white/10">
    <span className="text-sm text-gray-500 dark:text-white/80">{label}</span>
    {linkHref ? (
      <Link href={linkHref} className="text-sm text-[#8B85F4]">
        {value}
      </Link>
    ) : (
      <span className="text-sm dark:text-white">{value}</span>
    )}
  </div>
);

const Divider = () => (
  <div className="w-full border border-dashed border-[#EBEBEF] dark:border-[#FFFFFF1A]" />
);

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

const TransactionListItem = ({
  transaction,
  onClick,
}: {
  transaction: Transaction;
  onClick: () => void;
}) => (
  <div
    onClick={onClick}
    className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-white/5"
  >
    <div className="flex items-center gap-2">
      <div className="text-sm">
        <div className="flex items-center gap-x-2">
          <Image
            src={`/logos/${String(transaction.currency)?.toLowerCase()}-logo.svg`}
            alt={transaction.currency}
            width={12.02}
            height={11.54}
            quality={90}
          />
          <span className="dark:text-white/80">
            {transaction.type} {transaction.amount} {transaction.currency}
          </span>
        </div>
        <div className="mt-[0.75rem] flex items-center gap-1">
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
);

const TransactionList = ({
  onSelectTransaction,
}: {
  onSelectTransaction: (t: Transaction) => void;
}) => (
  <div className="scrollbar-hide max-h-[80vh] space-y-6 overflow-y-auto pb-4">
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

const CurrencyLogos = ({
  mainCurrency,
  swappedCurrency,
}: {
  mainCurrency: string;
  swappedCurrency?: string;
}) => (
  <div className="relative">
    <Image
      src={`/logos/${mainCurrency.toLowerCase()}-logo.svg`}
      alt={mainCurrency}
      width={20}
      height={20}
      quality={90}
      className="rounded-full"
    />
    {swappedCurrency && (
      <div className="absolute -right-[76%] -top-[1px] z-10 h-fit w-fit rounded-full border-[2px] border-white dark:border-surface-overlay">
        <Image
          src={`/logos/${swappedCurrency.toLowerCase()}-logo.svg`}
          alt={swappedCurrency}
          width={20}
          height={20}
          quality={90}
          className="rounded-full"
        />
      </div>
    )}
  </div>
);

const TransactionDetails = ({ transaction }: { transaction: Transaction }) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleGetReceipt = async () => {
    setIsLoading(true);
    try {
      const mockOrderDetails = {
        orderId: transaction.id,
        amount: transaction.amount,
        token: transaction.currency,
        network: "Arbitrum One",
        settlePercent: "100",
        status: transaction.status,
        txHash: "0x123...",
        settlements: [],
        txReceipts: [],
        updatedAt: new Date().toISOString(),
      };

      const mockFormData = {
        recipientName: transaction.recipient || "Unknown Recipient",
        accountIdentifier: transaction.account || "N/A",
        institution: transaction.bank || "Unknown Bank",
        memo: transaction.memo || "No memo",
        amountReceived:
          parseFloat(transaction.nativeValue.split(" ")[1].replace(/,/g, "")) ||
          0,
        currency: transaction.nativeValue.split(" ")[0] || "NGN",
      };

      const blob = await pdf(
        <PDFReceipt
          data={mockOrderDetails}
          formData={mockFormData}
          supportedInstitutions={[]}
        />,
      ).toBlob();

      const pdfUrl = URL.createObjectURL(blob);
      window.open(pdfUrl, "_blank");
    } catch (error) {
      toast.error("Error generating receipt. Please try again.");
      console.error("Error generating receipt:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="mt-4 flex items-center gap-2">
        <CurrencyLogos
          mainCurrency={transaction.currency}
          swappedCurrency={transaction.swappedCurrency}
        />
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
        <Divider />
        <DetailRow label="Amount" value={transaction.nativeValue} />
        <DetailRow label="Fees" value={transaction.fees} />
        <DetailRow label="Recipient" value={transaction.recipient} />
        <DetailRow label="Bank" value={transaction.bank} />
        <DetailRow label="Account" value={transaction.account} />
        <DetailRow label="Memo" value={transaction.memo} />
        <Divider />
        <DetailRow
          label="Date"
          value={`${transaction.time} 1${transaction.day}`}
        />
        <DetailRow label="Transaction status" value={transaction.status} />
        <DetailRow label="Fund status" value="Deposited" />
        <DetailRow label="Time spent" value={transaction.timeSpent} />
        <DetailRow
          label="Onchain receipt"
          value="View in explorer"
          linkHref="#"
        />
      </div>

      <button
        type="button"
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
  );
};
