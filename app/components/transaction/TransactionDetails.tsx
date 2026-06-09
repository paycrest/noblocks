"use client";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { ImSpinner } from "react-icons/im";
import { PiCheck } from "react-icons/pi";
import { toast } from "sonner";
import { usePrivy } from "@privy-io/react-auth";
import { CopyAddressWarningModal } from "../CopyAddressWarningModal";
import type {
  OnrampPaymentInstructions,
  TransactionHistory,
  Network,
  V2FiatProviderAccountDTO,
} from "../../types";
import {
  getExplorerLink,
  formatNumberWithCommas,
  getTokenLogoIdentifier,
  currencyToCountryCode,
  getCurrencySymbol,
  getNetworkImageUrl,
  shortenAddress,
  copyToClipboard,
  mapProviderAccountToInstructions,
  ONRAMP_CLIENT_PAYMENT_SESSION_MS,
  isOnrampClientPaymentSessionExpired,
  getTransactionHistoryTypeLabel,
  formatTransactionAmountDisplay,
} from "../../utils";
import {
  fetchV2SenderPaymentOrderById,
  unwrapV2SenderOrderEnvelope,
} from "../../api/aggregator";
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

function useOnrampClientPaymentSession(
  createdAt: string | undefined,
  transactionType: TransactionHistory["transaction_type"] | undefined,
  status: TransactionHistory["status"] | undefined,
) {
  const applies =
    transactionType === "onramp" &&
    (status === "pending" || status === "processing");

  const deadlineMs = useMemo(() => {
    if (!applies || !createdAt) return null;
    const t = new Date(createdAt).getTime();
    if (Number.isNaN(t)) return null;
    return t + ONRAMP_CLIENT_PAYMENT_SESSION_MS;
  }, [applies, createdAt]);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (deadlineMs === null) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [deadlineMs]);

  let timeRemainingLabel = "--:--";
  if (deadlineMs !== null) {
    if (Date.now() >= deadlineMs) {
      timeRemainingLabel = "00:00";
    } else {
      const diff = deadlineMs - Date.now();
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      timeRemainingLabel = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }
  }
  const expired =
    applies &&
    !!createdAt &&
    !!transactionType &&
    !!status &&
    isOnrampClientPaymentSessionExpired({
      created_at: createdAt,
      transaction_type: transactionType,
      status,
    });
  void tick;

  return { applies, expired, timeRemainingLabel, deadlineMs };
}

const STATUS_COLOR_MAP: Record<string, string> = {
  completed: "text-green-500",
  refunded: "text-red-500",
  refunding: "text-red-300",
  fulfilled: "text-blue-500",
  pending: "text-orange-500",
  processing: "text-yellow-500",
  expired: "text-amber-600 dark:text-amber-500",
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
  const onrampClientSession = useOnrampClientPaymentSession(
    transaction?.created_at,
    transaction?.transaction_type,
    transaction?.status,
  );
  if (!transaction) return null;

  // Use the transaction's stored network, not the globally selected network
  const explorerUrl =
    transaction.tx_hash && transaction.network
      ? getExplorerLink(transaction.network, transaction.tx_hash)
      : undefined;

  const handleGetReceipt = async () => {
    setIsLoading(true);
    try {
      const orderDetailsData = {
        orderId: transaction.order_id || "",
        amount: transaction.amount_sent.toString(),
        token: transaction.from_currency,
        network: transaction.network || "",
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
      // Lazy-load PDF renderer (heavy, ~MBs of fontkit/pdfkit) only on demand
      // so it never enters the first-load JS bundle for the transactions UI.
      const [{ pdf }, { PDFReceipt }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("../PDFReceipt"),
      ]);
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
              if (transaction.transaction_type === "onramp") {
                const fromId = getTokenLogoIdentifier(
                  transaction.from_currency,
                );
                const toId = getTokenLogoIdentifier(transaction.to_currency);
                return (
                  <>
                    <Image
                      src={
                        fromId === "lisk"
                          ? isDark
                            ? "/logos/lisk-logo-dark.svg"
                            : "/logos/lisk-logo-light.svg"
                          : `/logos/${fromId}-logo.svg`
                      }
                      alt={transaction.from_currency}
                      width={20}
                      height={20}
                      className="rounded-full border border-white dark:border-surface-canvas"
                    />
                    <Image
                      src={
                        toId === "lisk"
                          ? isDark
                            ? "/logos/lisk-logo-dark.svg"
                            : "/logos/lisk-logo-light.svg"
                          : `/logos/${toId}-logo.svg`
                      }
                      alt={transaction.to_currency}
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
          <div className="ml-2 text-lg font-medium leading-6 text-text-body dark:text-white/80">
            {getTransactionHistoryTypeLabel(transaction.transaction_type)}{" "}
            <span className="font-semibold text-text-body dark:text-white">
              {transaction.transaction_type === "onramp" ? (
                <>
                  {formatTransactionAmountDisplay(
                    transaction.amount_sent ?? 0,
                    transaction.from_currency,
                  )}
                </>
              ) : (
                <>
                  {formatTransactionAmountDisplay(
                    transaction.amount_sent,
                    transaction.from_currency,
                  )}
                </>
              )}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`${
              onrampClientSession.applies && onrampClientSession.expired
                ? STATUS_COLOR_MAP.expired
                : STATUS_COLOR_MAP[transaction.status] ||
                  "text-text-secondary dark:text-white/50"
            } text-sm`}
          >
            {onrampClientSession.applies && onrampClientSession.expired
              ? "expired"
              : transaction.status}
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
                {formatTransactionAmountDisplay(
                  transaction.amount_received ?? 0,
                  transaction.to_currency,
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
                  onClick={async () => {
                    const ok = await copyToClipboard(
                      transaction.recipient.account_identifier,
                      "Address",
                    );
                    if (!ok) return;
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
      ) : transaction.transaction_type === "onramp" ? (
        <div className="flex flex-col gap-5 px-1 pb-1">
          <OnrampPendingPaymentInstructions
            transaction={transaction}
            clientSessionExpired={onrampClientSession.expired}
            clientTimeRemainingLabel={onrampClientSession.timeRemainingLabel}
          />
          <DetailRow
            label="Amount"
            value={
              <span className="text-text-accent-gray dark:text-white/80">
                {formatTransactionAmountDisplay(
                  transaction.amount_received ?? 0,
                  transaction.to_currency,
                )}
              </span>
            }
          />
          <DetailRow
            label="Rate"
            value={
              <span className="text-text-accent-gray dark:text-white/80">
                {formatTransactionAmountDisplay(
                  transaction.fee ?? 0,
                  transaction.from_currency,
                )}{" "}
                ~ 1 {transaction.to_currency}
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
                  onClick={async () => {
                    const ok = await copyToClipboard(
                      transaction.recipient.account_identifier,
                      "Address",
                    );
                    if (!ok) return;
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
      ) : (
        <div className="flex flex-col gap-5 px-1 pb-1">
          <DetailRow
            label="Amount"
            value={
              <span className="text-text-accent-gray dark:text-white/80">
                {formatTransactionAmountDisplay(
                  transaction.amount_received ?? 0,
                  transaction.to_currency,
                )}
              </span>
            }
          />
          <DetailRow
            label="Rate"
            value={
              <span className="text-text-accent-gray dark:text-white/80">
                {formatTransactionAmountDisplay(
                  transaction.fee ?? 0,
                  transaction.to_currency,
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
            <span
              className={
                onrampClientSession.applies && onrampClientSession.expired
                  ? STATUS_COLOR_MAP.expired
                  : "text-text-secondary dark:text-white/50"
              }
            >
              {onrampClientSession.applies && onrampClientSession.expired
                ? "expired"
                : transaction.status}
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
        {explorerUrl && transaction.transaction_type !== "onramp" && (
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
      {transaction.status === "completed" &&
        (transaction.transaction_type === "onramp" ? (
          explorerUrl ? (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center rounded-xl bg-accent-gray py-2.5 text-sm font-medium text-text-body transition-all hover:bg-[#EBEBEF] focus:outline-none dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
            >
              View receipt
            </a>
          ) : null
        ) : (
          <button
            type="button"
            title="Download transaction receipt"
            onClick={handleGetReceipt}
            disabled={isLoading}
            className="w-full rounded-xl bg-accent-gray py-2.5 text-sm font-medium text-text-body transition-all hover:bg-[#EBEBEF] focus:outline-none disabled:opacity-70 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
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
        ))}

      <CopyAddressWarningModal 
            isOpen={isWarningModalOpen}
            onClose={() => setIsWarningModalOpen(false)}
            address={transaction.recipient.account_identifier ?? ""}
        />
    </motion.div>
  );
}

/** Fetches virtual account from aggregator for pending/processing on-ramp orders (history modal). */
function OnrampPendingPaymentInstructions({
  transaction,
  clientSessionExpired,
  clientTimeRemainingLabel,
}: {
  transaction: TransactionHistory;
  clientSessionExpired: boolean;
  clientTimeRemainingLabel: string;
}) {
  const { getAccessToken } = usePrivy();
  const [instructions, setInstructions] = useState<OnrampPaymentInstructions | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedAcct, setCopiedAcct] = useState(false);
  const [copiedAmt, setCopiedAmt] = useState(false);

  const shouldFetch =
    Boolean(transaction.order_id) &&
    (transaction.status === "pending" || transaction.status === "processing");

  useEffect(() => {
    if (!shouldFetch || !transaction.order_id || clientSessionExpired) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setInstructions(null);

    void (async () => {
      try {
        const token = await getAccessToken();
        if (!token) throw new Error("Sign in to load payment details");
        const res = await fetchV2SenderPaymentOrderById(
          transaction.order_id!,
          token,
        );
        const data =
          unwrapV2SenderOrderEnvelope(res) ??
          (res as unknown as { data?: { providerAccount?: V2FiatProviderAccountDTO } })
            .data;
        const pa =
          data && "providerAccount" in data
            ? (data as { providerAccount?: V2FiatProviderAccountDTO }).providerAccount
            : undefined;
        if (cancelled) return;
        if (!pa) {
          setLoadError("Payment instructions are no longer available.");
          return;
        }
        setInstructions(
          mapProviderAccountToInstructions(
            pa,
            transaction.from_currency,
            Number(transaction.amount_sent) || 0,
          ),
        );
      } catch (e) {
        if (!cancelled) {
          setLoadError(
            e instanceof Error ? e.message : "Could not load payment instructions",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    shouldFetch,
    transaction.order_id,
    transaction.status,
    transaction.from_currency,
    transaction.amount_sent,
    getAccessToken,
    clientSessionExpired,
  ]);

  if (!shouldFetch) return null;

  if (clientSessionExpired) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border-light bg-background-neutral px-3 py-3 dark:border-white/10 dark:bg-white/5">
        <ImSpinner className="size-4 shrink-0 animate-spin text-lavender-500" />
        <span className="text-sm text-text-secondary dark:text-white/50">
          Loading payment instructions…
        </span>
      </div>
    );
  }

  if (loadError) {
    return (
      <p className="text-sm text-text-secondary dark:text-white/50">{loadError}</p>
    );
  }

  if (!instructions) return null;

  const sym = getCurrencySymbol(instructions.currency);
  const formattedAmount = `${sym}${formatNumberWithCommas(instructions.amount)}`;

  return (
    <div className="grid gap-3 rounded-2xl border border-border-light bg-background-neutral p-4 dark:border-white/10 dark:bg-[#202121]">
      <p className="text-sm font-medium text-text-body dark:text-white/80">
        Pay with bank transfer
      </p>
      <p className="text-xs text-text-secondary dark:text-white/50">
        Send {formattedAmount} to the account below
      </p>
      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white dark:border-white/10 dark:bg-surface-canvas">
        <div className="grid gap-1.5 px-3 py-3">
          <span className="text-xs text-text-secondary dark:text-white/50">
            Provider / Bank
          </span>
          <span className="text-sm font-medium text-text-body dark:text-white/80">
            {instructions.provider}
          </span>
        </div>
        <div className="border-b border-gray-100 dark:border-white/10" />
        <div className="flex items-center justify-between gap-2 px-3 py-3">
          <div className="grid min-w-0 flex-1 gap-1">
            <span className="text-xs text-text-secondary dark:text-white/50">
              Account number
            </span>
            <span className="truncate font-mono text-sm font-medium text-text-body dark:text-white/80">
              {instructions.accountNumber}
            </span>
          </div>
          <button
            type="button"
            title="Copy account number"
            className="shrink-0 rounded-lg p-1.5 transition-colors hover:bg-gray-100 dark:hover:bg-white/10"
            onClick={() => {
              void copyToClipboard(instructions.accountNumber, "Account number");
              setCopiedAcct(true);
              setTimeout(() => setCopiedAcct(false), 2000);
            }}
          >
            {copiedAcct ? (
              <PiCheck className="size-4 text-icon-outline-secondary dark:text-white/50" />
            ) : (
              <Copy01Icon className="size-4 text-icon-outline-secondary dark:text-white/50" />
            )}
          </button>
        </div>
        <div className="border-b border-gray-100 dark:border-white/10" />
        <div className="flex items-center justify-between gap-2 px-3 py-3">
          <div className="grid gap-1">
            <span className="text-xs text-text-secondary dark:text-white/50">
              Amount to pay
            </span>
            <span className="text-sm font-medium text-text-body dark:text-white/80">
              {formattedAmount}
            </span>
          </div>
          <button
            type="button"
            title="Copy amount"
            className="shrink-0 rounded-lg p-1.5 transition-colors hover:bg-gray-100 dark:hover:bg-white/10"
            onClick={async () => {
              const ok = await copyToClipboard(
                String(instructions.amount),
                "Amount",
              );
              if (!ok) return;
              setCopiedAmt(true);
              setTimeout(() => setCopiedAmt(false), 2000);
            }}
          >
            {copiedAmt ? (
              <PiCheck className="size-4 text-icon-outline-secondary dark:text-white/50" />
            ) : (
              <Copy01Icon className="size-4 text-icon-outline-secondary dark:text-white/50" />
            )}
          </button>
        </div>
      </div>
      <p className="text-xs text-text-secondary dark:text-white/50">
        <span className="text-text-body dark:text-white/70">
          This account is only for this payment. Expires in{" "}
        </span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-lavender-500 dark:bg-surface-canvas dark:text-lavender-500">
          {clientTimeRemainingLabel}
        </span>
      </p>
    </div>
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
