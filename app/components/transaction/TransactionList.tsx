"use client";
import Image from "next/image";
import {
  classNames,
  getCurrencyImageSrc,
  generatePaginationItems,
  getRelativeDate,
  isOnrampClientPaymentSessionExpired,
  isNoblocksFiatCurrencyCode,
  getTransactionHistoryTypeLabel,
  formatTransactionAmountDisplay,
} from "../../utils";
import type { TransactionHistory } from "../../types";
import {
  formatCryptoWithSymbol,
  formatFiatWithCode,
  formatHistoryTime,
  serializeHistoryFilters,
  type TransactionHistoryFilters,
} from "../../lib/transactionHistoryFilters";
import { useEffect, useMemo, useReducer, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useActualTheme } from "../../hooks/useActualTheme";
import { useTransactions } from "../../context/TransactionsContext";
import { useInjectedWallet } from "../../context/InjectedWalletContext";
import { useApiAuth } from "../../hooks/useApiAuth";
import { ArrowLeft02Icon, ArrowRight02Icon } from "hugeicons-react";

interface TransactionListProps {
  onSelectTransaction?: (transaction: TransactionHistory) => void;
  filters?: TransactionHistoryFilters;
  /** Set when the active filter has no backing transaction type (e.g. the "Earn" chip) — skips the fetch and renders the empty card directly. */
  noResults?: boolean;
}

const pulseBar =
  "animate-pulse motion-reduce:animate-none bg-gray-200 dark:bg-white/10";

const STATUS_COLOR_MAP: Record<string, string> = {
  completed: "text-[#227738] dark:text-[#39c65d]",
  failed: "text-[#d50b3e] dark:text-[#f53d6b]",
  refunded: "text-red-500",
  refunding: "text-red-300",
  fulfilled: "text-blue-500",
  pending: "text-orange-500",
  processing: "text-yellow-500",
  expired: "text-amber-600 dark:text-amber-500",
};

function listItemStatusLabel(transaction: TransactionHistory): string {
  const status = isOnrampClientPaymentSessionExpired(transaction)
    ? "expired"
    : transaction.status;
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function listItemStatusClassName(transaction: TransactionHistory): string {
  if (isOnrampClientPaymentSessionExpired(transaction)) {
    return STATUS_COLOR_MAP.expired;
  }
  return (
    STATUS_COLOR_MAP[transaction.status] ||
    "text-text-secondary dark:text-white/50"
  );
}

/** Right-side amount: fiat legs show "CODE 1,234.56"; crypto legs keep the existing crypto formatter. */
function listItemReceivedAmount(transaction: TransactionHistory): string {
  if (isNoblocksFiatCurrencyCode(transaction.to_currency)) {
    return formatFiatWithCode(
      transaction.to_currency,
      transaction.amount_received,
    );
  }
  return formatTransactionAmountDisplay(
    transaction.amount_received,
    transaction.to_currency,
  );
}

/** Left-side sent amount: fiat legs keep the existing fiat formatter; crypto legs show at least 2 decimals. Credit rows show the received amount, since there's nothing sent. */
function listItemSentAmount(transaction: TransactionHistory): string {
  const amount =
    transaction.transaction_type === "credit"
      ? transaction.amount_received
      : transaction.amount_sent;
  if (isNoblocksFiatCurrencyCode(transaction.from_currency)) {
    return formatTransactionAmountDisplay(amount, transaction.from_currency);
  }
  return formatCryptoWithSymbol(amount, transaction.from_currency);
}

function TransactionRowSkeleton() {
  return (
    <div className="flex h-11 items-start justify-between" aria-hidden>
      <div className="flex flex-col gap-2">
        <div className="flex h-5 items-center gap-2">
          <div className={classNames("size-4 rounded-full", pulseBar)} />
          <div className={classNames("h-4 w-[140px] rounded", pulseBar)} />
        </div>
        <div className={classNames("h-3 w-[90px] rounded", pulseBar)} />
      </div>
      <div className={classNames("h-4 w-[100px] rounded", pulseBar)} />
    </div>
  );
}

function TransactionListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading transactions">
      <div className="flex items-center gap-4">
        <div className={classNames("h-4 w-16 rounded", pulseBar)} />
        <div className="h-px flex-1 border-t border-dashed border-border-light dark:border-white/10" />
      </div>
      <div className="mt-6 flex flex-col gap-5">
        {Array.from({ length: 6 }).map((_, index) => (
          <TransactionRowSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}

function TransactionEmptyCard({ filtered }: { filtered?: boolean }) {
  return (
    <div className="flex h-[252px] flex-col items-center justify-center px-5 py-12 text-center">
      <p className="font-sans text-[15px] font-semibold leading-9 tracking-[-0.03em] text-neutral-900 dark:text-white">
        {filtered ? "No matching transactions" : "No transactions yet"}
      </p>
      <p className="mt-[3px] max-w-[212px] font-general-sans text-sm font-medium leading-5 tracking-[-0.01em] text-text-secondary dark:text-white/50">
        {filtered
          ? "Try a different search or filter."
          : "All the transactions and activity will show up here."}
      </p>
    </div>
  );
}

function TransactionErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-[252px] flex-col items-center justify-center gap-2 px-5 py-12 text-center">
      <p className="font-general-sans text-sm font-medium text-text-secondary dark:text-white/50">
        Couldn&apos;t load transactions.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="font-general-sans text-sm font-medium text-lavender-500 hover:underline"
      >
        Retry
      </button>
    </div>
  );
}

// Main TransactionList component
export default function TransactionList({
  onSelectTransaction,
  filters,
  noResults,
}: TransactionListProps) {
  const { user } = usePrivy();
  const {
    isInjectedWallet,
    injectedAddress,
    injectedReady,
    getInjectedToken,
  } = useInjectedWallet();
  const { resolveAuth } = useApiAuth();
  const limit = 30;
  const isDark = useActualTheme();

  // Get embedded wallet address
  const embeddedWallet = user?.linkedAccounts.find(
    (account) =>
      account.type === "wallet" && account.connectorType === "embedded",
  ) as { address: string } | undefined;

  // In embed mode the host/extension wallet owns the history, and its SIWE session is what
  // authenticates the request.
  const walletAddress = isInjectedWallet
    ? (injectedAddress ?? undefined)
    : embeddedWallet?.address;

  // Use the transactions context
  const {
    transactions,
    total,
    isLoading,
    error,
    currentPage,
    fetchTransactions,
    refreshTransactions,
    setPage,
  } = useTransactions();

  /** Re-render every second so on-ramp rows flip to "expired" without an API update. */
  const [, listRenderTick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const id = setInterval(() => listRenderTick(), 1000);
    return () => clearInterval(id);
  }, []);

  // Opening the history view is an explicit user action, so establish the injected SIWE session here
  // (one signature, cached ~1h) — same pattern as BridgeForm/KycModal. Without it an injected user
  // who lands on history before any signing sees a permanently empty list: the fetch below reads
  // passively and its deps never change once a session appears.
  useEffect(() => {
    if (isInjectedWallet && injectedReady) {
      void getInjectedToken({ interactive: true });
    }
  }, [isInjectedWallet, injectedReady, getInjectedToken]);

  // Reset to page 1 whenever the active filter changes (including toggling the "Earn" chip,
  // which has no backing type and never reaches the fetch below).
  const filtersKey = noResults ? "__no-results__" : serializeHistoryFilters(filters);
  const prevFiltersKeyRef = useRef(filtersKey);
  useEffect(() => {
    if (prevFiltersKeyRef.current !== filtersKey) {
      prevFiltersKeyRef.current = filtersKey;
      setPage(1);
    }
  }, [filtersKey, setPage]);

  // Fetch transactions when wallet address, page, or filters change. A filter/page change while a
  // fetch is in flight must still be issued — TransactionsContext resolves which response wins.
  // Only the exact same request (same wallet/page/filters) already in flight is deduped, since the
  // page-reset effect above and this effect can otherwise both fire for the same filter change.
  const inFlightKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!walletAddress || noResults) return;
    const requestKey = `${walletAddress}-${currentPage}-${filtersKey}`;
    if (inFlightKeyRef.current === requestKey) return;
    inFlightKeyRef.current = requestKey;

    const clearInFlight = () => {
      if (inFlightKeyRef.current === requestKey) {
        inFlightKeyRef.current = null;
      }
    };

    // Passive: opening the history list must not pop a SIWE signature request. Injected users who
    // haven't signed yet get an empty list until a user action establishes the session.
    void resolveAuth({ interactive: false })
      .then(({ accessToken, injectedToken }) => {
        if (accessToken || injectedToken) {
          return fetchTransactions(
            walletAddress,
            accessToken,
            currentPage,
            limit,
            false,
            injectedToken,
            filters,
          );
        }
      })
      .finally(clearInFlight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress, currentPage, filtersKey, noResults, resolveAuth, fetchTransactions]);

  // Group transactions by date
  const groupedTransactions = useMemo(() => {
    // First, filter out duplicate transactions based on order_id
    const uniqueTransactions = transactions.reduce((acc, transaction) => {
      if (!transaction.order_id) {
        // If no order_id, keep the transaction (it's unique)
        acc.push(transaction);
        return acc;
      }

      const existingTransaction = acc.find(
        (t) => t.order_id === transaction.order_id,
      );
      if (!existingTransaction) {
        // If this order_id doesn't exist yet, add the transaction
        acc.push(transaction);
      } else {
        // If order_id already exists, keep the more recent transaction
        const existingDate = new Date(existingTransaction.created_at);
        const currentDate = new Date(transaction.created_at);
        if (currentDate > existingDate) {
          // Replace the existing transaction with the more recent one
          const index = acc.findIndex(
            (t) => t.order_id === transaction.order_id,
          );
          acc[index] = transaction;
        }
      }
      return acc;
    }, [] as TransactionHistory[]);

    const groups = uniqueTransactions.reduce(
      (acc, transaction) => {
        const date = new Date(transaction.created_at);
        const relativeDate = getRelativeDate(date);

        if (!acc[relativeDate]) {
          acc[relativeDate] = [];
        }
        acc[relativeDate].push(transaction);
        return acc;
      },
      {} as Record<string, TransactionHistory[]>,
    );

    // Sort groups by date (most recent first)
    return Object.entries(groups).sort((a, b) => {
      const dateA = new Date(a[1][0].created_at);
      const dateB = new Date(b[1][0].created_at);
      return dateB.getTime() - dateA.getTime();
    });
  }, [transactions]);

  // Show message if no wallet is connected
  if (!walletAddress) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
        <p className="text-lg font-medium text-gray-900 dark:text-white">
          No wallet connected
        </p>
        <p className="mt-2 text-sm text-gray-500 dark:text-white/50">
          Please connect your wallet to view transactions
        </p>
      </div>
    );
  }

  const hasRows = !noResults && transactions.length > 0;
  const showLoadingSkeleton = !noResults && isLoading && transactions.length === 0;
  const showEmptyCard = noResults || (!isLoading && transactions.length === 0 && !error);
  const showErrorCard = !noResults && !isLoading && transactions.length === 0 && !!error;
  const isFilteredEmpty = noResults || serializeHistoryFilters(filters) !== "";

  return (
    <div className="flex h-full w-full flex-col">
      <div className="rounded-3xl bg-accent-gray p-5 dark:bg-white/[0.02]">
        {showLoadingSkeleton ? (
          <TransactionListSkeleton />
        ) : showErrorCard ? (
          <TransactionErrorCard onRetry={() => void refreshTransactions()} />
        ) : showEmptyCard ? (
          <TransactionEmptyCard filtered={isFilteredEmpty} />
        ) : (
          <div className="flex flex-col gap-6">
            {groupedTransactions.map(([date, txs]) => (
              <div key={date}>
                <div className="flex items-center gap-4">
                  <h3 className="whitespace-nowrap font-general-sans text-sm leading-5 tracking-[-0.01em] text-text-secondary dark:text-white/50">
                    {date}
                  </h3>
                  <div className="h-px flex-1 border-t border-dashed border-border-light dark:border-white/10" />
                </div>
                <div className="mt-6 flex flex-col gap-5">
                  {txs.map((transaction) => (
                    <div
                      key={transaction.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectTransaction?.(transaction)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelectTransaction?.(transaction);
                        }
                      }}
                      className="flex h-11 cursor-pointer items-start justify-between rounded-xl px-2 -mx-2 outline-none transition-colors hover:bg-white/50 focus-visible:ring-2 focus-visible:ring-lavender-500 focus-visible:ring-offset-2 focus-visible:ring-offset-accent-gray dark:hover:bg-white/5 dark:focus-visible:ring-offset-0"
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex h-5 items-center gap-2">
                          <Image
                            src={getCurrencyImageSrc(
                              transaction.from_currency,
                              isDark,
                            )}
                            alt={transaction.from_currency}
                            width={16}
                            height={16}
                            quality={90}
                            className="size-4 rounded-full"
                          />
                          <span className="font-general-sans text-sm text-text-accent-gray dark:text-white/80">
                            {getTransactionHistoryTypeLabel(
                              transaction.transaction_type,
                            )}{" "}
                            <span className="font-medium text-neutral-900 dark:text-white">
                              {listItemSentAmount(transaction)}
                            </span>
                          </span>
                        </div>
                        <div className="flex h-4 items-center gap-2">
                          <span className="font-general-sans text-xs text-text-secondary dark:text-white/50">
                            {formatHistoryTime(
                              new Date(transaction.created_at),
                            )}
                          </span>
                          <span className="size-1 rounded-full bg-icon-outline-disabled dark:bg-white/30" />
                          <span
                            className={classNames(
                              "font-general-sans text-xs",
                              listItemStatusClassName(transaction),
                            )}
                          >
                            {listItemStatusLabel(transaction)}
                          </span>
                        </div>
                      </div>

                      <span className="font-general-sans text-sm text-text-secondary dark:text-white/50">
                        {listItemReceivedAmount(transaction)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {!!error && (
              <div className="mt-6 flex items-center justify-center gap-2">
                <span className="font-general-sans text-sm text-text-secondary dark:text-white/50">
                  Couldn&apos;t load transactions.
                </span>
                <button
                  type="button"
                  onClick={() => void refreshTransactions()}
                  className="font-general-sans text-sm font-medium text-lavender-500 hover:underline"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pagination controls */}
      {(currentPage > 1 || (hasRows && Math.ceil(total / limit) > 1)) && (
        <div className="mt-6 flex flex-grow items-end justify-center gap-2">
          <button
            type="button"
            onClick={() => setPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1 || isLoading}
            className="size-8 rounded-lg border border-border-light bg-white text-sm font-medium text-text-accent-gray transition-all hover:bg-accent-gray disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10"
            aria-label="Go to previous page"
          >
            <ArrowLeft02Icon className="mx-auto size-4" />
          </button>

          <div
            className="flex items-center gap-1"
            role="navigation"
            aria-label="Pagination"
          >
            {generatePaginationItems(currentPage, Math.ceil(total / limit)).map(
              (item, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => typeof item === "number" && setPage(item)}
                  disabled={isLoading || item === "..."}
                  className={classNames(
                    "flex size-8 items-center justify-center rounded-lg text-sm font-medium transition-all",
                    item === currentPage
                      ? "bg-secondary text-white hover:bg-secondary/80"
                      : item === "..."
                        ? "cursor-default text-gray-400"
                        : "border border-border-light bg-white text-text-accent-gray hover:bg-accent-gray dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10",
                  )}
                  aria-label={
                    item === "..." ? "More pages" : `Go to page ${item}`
                  }
                  aria-current={item === currentPage ? "page" : undefined}
                >
                  {item}
                </button>
              ),
            )}
          </div>

          <button
            type="button"
            onClick={() => setPage(currentPage + 1)}
            disabled={currentPage * limit >= total || isLoading}
            className="size-8 rounded-lg border border-border-light bg-white text-sm font-medium text-text-accent-gray transition-all hover:bg-accent-gray disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10"
            aria-label="Go to next page"
          >
            <ArrowRight02Icon className="mx-auto size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
