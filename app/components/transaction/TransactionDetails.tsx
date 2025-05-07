"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ImSpinner } from "react-icons/im";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { pdf } from "@react-pdf/renderer";
import { PDFReceipt } from "../PDFReceipt";
import type { Transaction } from "../../types";
import { classNames, formatNumberWithCommas } from "../../utils";

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
  fromCurrency,
  toCurrency,
}: {
  fromCurrency: string;
  toCurrency: string;
}) => (
  <div className="relative">
    <Image
      src={`/logos/${fromCurrency.toLowerCase()}-logo.svg`}
      alt={fromCurrency}
      width={20}
      height={20}
      quality={90}
      className="rounded-full"
    />
    <div className="absolute -right-[76%] -top-[1px] z-10 h-fit w-fit rounded-full border-[2px] border-white dark:border-surface-overlay">
      <Image
        src={`/logos/${toCurrency.toLowerCase()}-logo.svg`}
        alt={toCurrency}
        width={20}
        height={20}
        quality={90}
        className="rounded-full"
      />
    </div>
  </div>
);

interface TransactionDetailsProps {
  transaction: Transaction | null;
}

export function TransactionDetails({ transaction }: TransactionDetailsProps) {
  if (!transaction) return null;

  const [isLoading, setIsLoading] = useState(false);

  const handleGetReceipt = async () => {
    setIsLoading(true);
    try {
      const mockOrderDetails = {
        orderId: transaction.id,
        amount: transaction.amount_sent.toString(),
        token: transaction.from_currency,
        network: "Arbitrum One",
        settlePercent: "100",
        status: transaction.status,
        txHash: transaction.tx_hash || "",
        settlements: [],
        txReceipts: [],
        updatedAt: transaction.created_at,
      };

      const mockFormData = {
        recipientName: transaction.recipient.account_name,
        accountIdentifier: transaction.recipient.account_identifier,
        institution: transaction.recipient.institution,
        memo: transaction.memo || "No memo",
        amountReceived: transaction.amount_received,
        currency: transaction.to_currency,
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
            fromCurrency={transaction.from_currency}
            toCurrency={transaction.to_currency}
          />
          <span className="ml-2 text-lg dark:text-white/80">
            Swapped{" "}
            <span className="dark:text-white">
              {formatNumberWithCommas(transaction.amount_sent)}{" "}
              {transaction.from_currency} →{" "}
              {formatNumberWithCommas(transaction.amount_received)}{" "}
              {transaction.to_currency}
            </span>
          </span>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-white/50">Amount</p>
            <p className="font-medium text-text-body dark:text-white">
              {formatNumberWithCommas(transaction.amount_sent)}{" "}
              {transaction.from_currency} →{" "}
              {formatNumberWithCommas(transaction.amount_received)}{" "}
              {transaction.to_currency}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-white/50">
              Recipient
            </p>
            <p className="font-medium text-text-body dark:text-white">
              {transaction.recipient.account_name}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-white/50">Bank</p>
            <p className="font-medium text-text-body dark:text-white">
              {transaction.recipient.institution}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-white/50">Account</p>
            <p className="font-medium text-text-body dark:text-white">
              {transaction.recipient.account_identifier}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-white/50">Status</p>
            <span
              className={`rounded-full px-2 py-1 text-xs ${
                transaction.status === "completed" ||
                transaction.status === "settled"
                  ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                  : transaction.status === "failed" ||
                      transaction.status === "refunded"
                    ? "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400"
                    : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400"
              }`}
            >
              {transaction.status}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-white/50">Date</p>
            <p className="font-medium text-text-body dark:text-white">
              {new Date(transaction.created_at).toLocaleString()}
            </p>
          </div>

          {transaction.time_spent && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500 dark:text-white/50">
                Time spent
              </p>
              <p className="font-medium text-text-body dark:text-white">
                {transaction.time_spent}
              </p>
            </div>
          )}

          {transaction.memo && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500 dark:text-white/50">Memo</p>
              <p className="font-medium text-text-body dark:text-white">
                {transaction.memo}
              </p>
            </div>
          )}

          {transaction.tx_hash && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500 dark:text-white/50">
                Transaction hash
              </p>
              <a
                href={`https://etherscan.io/tx/${transaction.tx_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-lavender-500 hover:underline"
              >
                {transaction.tx_hash.slice(0, 6)}...
                {transaction.tx_hash.slice(-4)}
              </a>
            </div>
          )}
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
}
