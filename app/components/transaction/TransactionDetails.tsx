"use client";
import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { ImSpinner } from "react-icons/im";
import { toast } from "sonner";
import { pdf } from "@react-pdf/renderer";
import { PDFReceipt } from "../PDFReceipt";
import { CopyAddressWarningModal } from "../CopyAddressWarningModal";
import type { TransactionHistory, Network } from "../../types";
import {
  getExplorerLink,
  formatNumberWithCommas,
  getTokenLogoIdentifier,
  currencyToCountryCode,
  formatCurrency,
  getNetworkImageUrl,
  shortenAddress,
} from "../../utils";
import { useNetwork } from "../../context/NetworksContext";
import { useActualTheme } from "../../hooks/useActualTheme";
import { networks } from "../../mocks";
import { Copy01Icon } from "hugeicons-react";

interface TransactionDetailsProps {
  transaction: TransactionHistory | null;
}

const Divider = () => (
  <div className="my-4 w-full border-t border-dashed border-border-light dark:border-white/10" />
);

const STATUS_COLOR_MAP: Record<string, string> = {
  completed: "text-green-500",
  refunded: "text-red-500",
  fulfilled: "text-blue-500",
  pending: "text-orange-500",
  processing: "text-yellow-500",
};

// Helper function to get network object from network name
const getNetworkFromName = (networkName: string): Network | null => {
  return networks.find((network) => network.chain.name === networkName) || null;
};

export function TransactionDetails({ transaction }: TransactionDetailsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isWarningModalOpen, setIsWarningModalOpen] = useState(false);
  const { selectedNetwork } = useNetwork();
  const isDark = useActualTheme();
  if (!transaction) return null;

  const explorerUrl =
    transaction.tx_hash && selectedNetwork?.chain?.name
      ? getExplorerLink(selectedNetwork.chain.name, transaction.tx_hash)
      : undefined;

  const handleGetReceipt = async () => {
    setIsLoading(true);
    try {
      const orderDetailsData = {
        orderId: transaction.order_id || "",
        amount: transaction.amount_sent.toString(),
        token: transaction.from_currency,
        network: selectedNetwork?.chain?.name || "",
        settlePercent: "100",
        status: transaction.status,
        txHash: transaction.tx_hash || "",
        settlements: [],
        txReceipts: [],
        updatedAt: transaction.created_at,
      };
      const formData = {
        recipientName: transaction.recipient.account_name,
        accountIdentifier: transaction.recipient.account_identifier,
        institution: transaction.recipient.institution,
        memo: transaction.recipient.memo || "No memo",
        amountReceived: transaction.amount_received,
        currency: transaction.to_currency,
      };
      const blob = await pdf(
        <PDFReceipt data={orderDetailsData} formData={formData} />,
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
      className="flex h-full w-full flex-col gap-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2 }}
    >
      {/* Top: Token icons, swapped amount, status */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            {(() => {
              if (transaction.transaction_type === "transfer") {
                const networkObj = getNetworkFromName(transaction.network);
                return (
                  <>
                    {networkObj && (
                      <Image
                        src={getNetworkImageUrl(networkObj, isDark)}
                        alt={transaction.network}
                        width={20}
                        height={20}
                        className="rounded-full border border-white dark:border-surface-canvas"
                      />
                    )}
                    <Image
                      src={`/logos/${transaction.from_currency.toLowerCase()}-logo.svg`}
                      alt={transaction.from_currency}
                      width={20}
                      height={20}
                      className="rounded-full border border-white dark:border-surface-canvas"
                    />
                  </>
                );
              }
              const fromLogo = getTokenLogoIdentifier(transaction.from_currency);
              const toCountryCode = currencyToCountryCode(
                transaction.to_currency,
              );
              return (
                <>
                  <Image
                    src={
                      fromLogo === "lisk"
                        ? isDark
                          ? "/logos/lisk-logo-dark.svg"
                          : "/logos/lisk-logo-light.svg"
                        : `/logos/${fromLogo}-logo.svg`
                    }
                    alt={transaction.from_currency}
                    width={20}
                    height={20}
                    className="rounded-full border border-white dark:border-surface-canvas"
                  />
                  <Image
                    src={`https://flagcdn.com/h24/${toCountryCode}.webp`}
                    alt={transaction.to_currency}
                    width={20}
                    height={20}
                    className="rounded-full border border-white dark:border-surface-canvas"
                  />
                </>
              );
            })()}
          </div>
          <div className="ml-2 text-lg font-medium capitalize leading-6 text-text-body dark:text-white/80">
            {transaction.transaction_type === "transfer"
              ? "Transferred"
              : transaction.transaction_type === "swap"
                ? "Swapped"
                : transaction.transaction_type}{" "}
            <span className="font-semibold text-text-body dark:text-white">
              {formatNumberWithCommas(transaction.amount_sent)}{" "}
              {transaction.from_currency}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`${STATUS_COLOR_MAP[transaction.status] || "text-text-secondary dark:text-white/50"} text-sm`}
          >
            {transaction.status}
          </span>
        </div>
      </div>
      <Divider />
      {/* Details section 1 */}
      {transaction.transaction_type === "transfer" ? (
        <div className="flex flex-col gap-5 px-1 pb-1">
          <DetailRow
            label="Amount"
            value={
              <span className="text-text-accent-gray dark:text-white/80">
                {formatCurrency(
                  transaction.amount_received ?? 0,
                  transaction.to_currency,
                  `en-${transaction.to_currency.slice(0, 2)}`,
                )}
              </span>
            }
          />
          {transaction.network && (
            <DetailRow
              label="Network"
              value={
                <div className="flex items-center gap-2">
                  {(() => {
                    const networkObj = getNetworkFromName(transaction.network);
                    if (networkObj) {
                      return (
                        <>
                          {getNetworkImageUrl(networkObj, isDark) && (
                            <Image
                              src={getNetworkImageUrl(networkObj, isDark)}
                              alt={transaction.network}
                              width={16}
                              height={16}
                              className="rounded-full"
                            />
                          )}
                          <span className="text-text-accent-gray dark:text-white/80">
                            {transaction.network}
                          </span>
                        </>
                      );
                    }
                    return (
                      <span className="text-text-accent-gray dark:text-white/80">
                        {transaction.network}
                      </span>
                    );
                  })()}
                </div>
              }
            />
          )}
          <DetailRow
            label="Recipient"
            value={
              <span className="flex items-center gap-2 text-text-accent-gray dark:text-white/80">
                {shortenAddress(transaction.recipient.account_identifier)}
                <button
                  type="button"
                  title="Copy address"
                  className="rounded-lg p-1 transition-colors hover:bg-accent-gray dark:hover:bg-white/10"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      transaction.recipient.account_identifier,
                    );
                    toast.success("Address copied");
                    setIsWarningModalOpen(true);
                  }}
                >
                  <Copy01Icon
                    className="size-4 text-outline-gray dark:text-white/50"
                    strokeWidth={2}
                  />
                </button>
              </span>
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-5 px-1 pb-1">
          <DetailRow
            label="Amount"
            value={
              <span className="text-text-accent-gray dark:text-white/80">
                {formatCurrency(
                  transaction.amount_received ?? 0,
                  transaction.to_currency,
                  `en-${transaction.to_currency.slice(0, 2)}`,
                )}
              </span>
            }
          />
          <DetailRow
            label="Rate"
            value={
              <span className="text-text-accent-gray dark:text-white/80">
                {formatCurrency(
                  transaction.fee ?? 0,
                  transaction.to_currency,
                  `en-${transaction.to_currency.slice(0, 2)}`,
                )}
              </span>
            }
          />
          {transaction.network && (
            <DetailRow
              label="Network"
              value={
                <div className="flex items-center gap-2">
                  {(() => {
                    const networkObj = getNetworkFromName(transaction.network);
                    if (networkObj) {
                      return (
                        <>
                          {getNetworkImageUrl(networkObj, isDark) && (
                            <Image
                              src={getNetworkImageUrl(networkObj, isDark)}
                              alt={transaction.network}
                              width={16}
                              height={16}
                              className="rounded-full"
                            />
                          )}
                          <span className="text-text-accent-gray dark:text-white/80">
                            {transaction.network}
                          </span>
                        </>
                      );
                    }
                    return (
                      <span className="text-text-accent-gray dark:text-white/80">
                        {transaction.network}
                      </span>
                    );
                  })()}
                </div>
              }
            />
          )}
          <DetailRow
            label="Recipient"
            value={
              <span className="capitalize text-text-accent-gray dark:text-white/80">
                {transaction.recipient.account_name.toLocaleLowerCase()}
              </span>
            }
          />
          <DetailRow
            label="Bank"
            value={
              <span className="text-text-accent-gray dark:text-white/80">
                {transaction.recipient.institution}
              </span>
            }
          />
          <DetailRow
            label="Account"
            value={
              <span className="text-text-accent-gray dark:text-white/80">
                {transaction.recipient.account_identifier}
              </span>
            }
          />
          {transaction.recipient.memo && (
            <DetailRow
              label="Memo"
              value={
                <span className="text-text-accent-gray dark:text-white/80">
                  {transaction.recipient.memo}
                </span>
              }
            />
          )}
        </div>
      )}
      <Divider />
      {/* Details section 2 */}
      <div className="flex flex-col gap-5 px-1">
        <DetailRow
          label="Date"
          value={
            <span className="text-text-secondary dark:text-white/50">
              {new Date(transaction.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
              {"  "}
              {new Date(transaction.created_at).toLocaleDateString([], {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </span>
          }
        />
        <DetailRow
          label="Transaction status"
          value={
            <span className="text-text-secondary dark:text-white/50">
              {transaction.status}
            </span>
          }
        />
        {transaction.time_spent && (
          <DetailRow
            label="Time spent"
            value={
              <span className="text-text-secondary dark:text-white/50">
                {transaction.time_spent}
              </span>
            }
          />
        )}
        {explorerUrl && (
          <DetailRow
            label="Onchain receipt"
            value={
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-lavender-500 hover:underline"
              >
                View in explorer
              </a>
            }
          />
        )}
      </div>
      <div className="flex-1" />
      {transaction.status === "completed" && (
        <button
          type="button"
          title="Download transaction receipt"
          onClick={handleGetReceipt}
          disabled={isLoading}
          className="w-full rounded-xl bg-accent-gray py-2.5 text-sm font-medium text-text-body transition-all hover:bg-[#EBEBEF] focus:outline-hidden disabled:opacity-70 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
        >
          {isLoading ? (
            <div className="flex items-center justify-center gap-2">
              <ImSpinner className="size-5 animate-spin text-text-body dark:text-white" />
              <span>Generating receipt...</span>
            </div>
          ) : (
            "Get receipt"
          )}
        </button>
      )}

      <CopyAddressWarningModal 
            isOpen={isWarningModalOpen}
            onClose={() => setIsWarningModalOpen(false)}
            address={transaction.recipient.account_identifier ?? ""}
        />
    </motion.div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex w-full items-center justify-between">
      <div className="text-sm font-normal leading-5 text-text-secondary dark:text-white/50">
        {label}
      </div>
      <div className="max-w-[60%] break-words text-right text-sm font-normal leading-5 text-text-accent-gray dark:text-white/80">
        {value}
      </div>
    </div>
  );
}
