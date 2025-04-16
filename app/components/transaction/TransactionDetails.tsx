"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ImSpinner } from "react-icons/im";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { pdf } from "@react-pdf/renderer";
import { PDFReceipt } from "../PDFReceipt";
import { Transaction } from "./types";
import { classNames } from "../../utils";

const DetailRow = ({
  label,
  value,
  linkHref,
}: {
  label: string;
  value: React.ReactNode;
  linkHref?: string;
}) => (
  <div className="flex justify-between py-3.5 dark:border-white/10">
    <span className="text-sm text-gray-500 dark:text-white/50">{label}</span>
    {linkHref ? (
      <Link href={linkHref} className="text-sm text-[#8B85F4]">
        {value}
      </Link>
    ) : (
      <span className="text-sm dark:text-white/80">{value}</span>
    )}
  </div>
);

const Divider = () => (
  <div className="my-2 w-full border border-dashed border-[#EBEBEF] dark:border-[#FFFFFF1A]" />
);

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

export const TransactionDetails = ({
  transaction,
}: {
  transaction: Transaction;
}) => {
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
    <motion.div
      className="flex h-full flex-col"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex-grow space-y-4">
        <div className="flex items-center gap-4">
          <CurrencyLogos
            mainCurrency={transaction.currency}
            swappedCurrency={transaction.swappedCurrency}
          />
          <span className="ml-2 text-lg dark:text-white/80">
            Swapped{" "}
            <span className="dark:text-white">
              {transaction.amount} {transaction.currency}
            </span>
          </span>
        </div>

        <p
          className={classNames(
            "text-sm",
            transaction.status === "Completed"
              ? "text-green-500"
              : "text-red-500",
          )}
        >
          {transaction.status}
        </p>

        <div>
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
            value={`${transaction.time} ${transaction.day}`}
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
      </div>

      <div className="mt-auto pt-4">
        <button
          type="button"
          title="Download transaction receipt"
          onClick={handleGetReceipt}
          disabled={isLoading}
          className="w-full rounded-xl bg-[#F7F7F8] py-3 font-medium text-[#121217] transition-all hover:bg-[#EBEBEF] focus:outline-none disabled:opacity-70 dark:bg-[#363636] dark:text-white dark:hover:bg-[#363636]/80"
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
    </motion.div>
  );
};
