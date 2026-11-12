"use client";

import React, {
  useMemo,
  useId,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import {
  ArrowDown01Icon,
  Wallet01Icon,
  ArrowRight02Icon,
  Cancel01Icon,
  InformationSquareIcon,
  ArrowDown02Icon,
  CheckmarkCircle01Icon,
  SadDizzyIcon,
  ArrowDataTransferVerticalIcon,
  Loading03Icon,
} from "hugeicons-react";

import { saveTransaction } from "@/app/api/aggregator";
import { AnimatedModal } from "@/app/components/AnimatedComponents";
import {
  BridgePicker,
  type BridgePickerItem,
} from "@/app/components/bridge/BridgePicker";
import {
  drawerCloseButtonClasses,
  drawerDividerClasses,
  drawerModalTitleClasses,
  drawerDashedDividerClasses,
  drawerSuccessIconClasses,
  drawerModalScrimClasses,
} from "@/app/components/drawer/drawerStyles";
import { TransferPendingModal } from "@/app/components/transfer/TransferPendingModal";
import { useBalance, useTokens, useInjectedWallet } from "@/app/context";
import { useNetwork } from "@/app/context/NetworksContext";
import { useStarknet } from "@/app/context/StarknetContext";
import {
  useBridgeQuote,
  useBridgeExecute,
  useBridgeStatus,
} from "@/app/hooks/bridge";
import type { BridgeSubmitInfo } from "@/app/hooks/useBridgeStatusTracker";
import { useDelegationContractAuth } from "@/app/hooks/useEIP7702Account";
import { useWalletAddress } from "@/app/hooks/useWalletAddress";
import {
  engineFromQuote,
  toRawAmount,
  bridgeFeeInReceivingToken,
  bridgeInstitutionLabel,
  type BridgeLeg,
  type BridgeQuote,
  type BridgeEngine,
} from "@/app/lib/bridge";
import { mapReportAndAct } from "@/app/lib/toastMappedError";
import { tokensEqual } from "@/app/lib/token-symbol";
import { networks } from "@/app/mocks";
import type { Token } from "@/app/types";
import {
  formatTokenAmount,
  classNames,
  formatDecimalPrecision,
  getExplorerLink,
} from "@/app/utils";

export const SWAP_COPY = {
  subtitle: "Swap tokens on any network",
  from: "From",
  to: "to",
  sell: "Sell",
  receive: "Receive",
  selectToken: "Select token",
  selectNetwork: "Select network",
  reviewCta: "Review swap",
  swapCta: "Swap",
  reviewTitle: "Review swap",
  youPay: "You pay",
  exchangeRate: "Exchange rate",
  receiveAtLeast: "Receive at least",
  fee: "Fee",
  fees: "Fees",
  warning:
    "Swaps cannot be reversed. Check the transaction details above before confirming.",
  successTitle: "Swap successful",
  completeTitle: "Swap Complete",
  transactionStatus: "Transaction status",
  completed: "Completed",
  fundStatus: "Fund status",
  swapped: "Swapped",
  timeSpent: "Time spent",
  transactionFee: "Transaction fee",
  date: "Date",
  viewInExplorer: "View in explorer",
  viewOnExplorer: "View on explorer",
  failedTitle: "Swap failed",
  failedMessage: "Please try again.",
  tryAgain: "Try again",
  close: "Close",
  done: "Done",
  pendingTitle: "Swapping your tokens...",
  pendingNote:
    "You can leave this screen, we will proceed to completing your swap",
  etaFallback: "Swap usually completes in 15 sec",
  noRail: "No swap route is available for this pair at this time.",
} as const;

/** Builds a same-network BridgeLeg from a chosen token symbol, mirroring
 * BridgeRouteSelector's buildTokenLeg — UI-level lookup only, no money logic. */
export function buildSwapLeg(
  networkName: string | null,
  symbol: string | null,
  allTokens: Record<string, Token[]>,
): BridgeLeg | null {
  if (!networkName || !symbol) return null;
  const network = networks.find((n) => n.chain.name === networkName);
  const token = (allTokens[networkName] ?? []).find((t) =>
    tokensEqual(t.symbol, symbol),
  );
  if (!network || !token) return null;
  return {
    network: network.chain.name,
    chainId: network.chain.id,
    token: token.symbol,
    tokenAddress: token.address,
    decimals: token.decimals,
    amount: "0",
    rawAmount: "0",
  };
}

/** Disables Review/Swap whenever there is no valid, current quote. No
 * min-amount or cNGN-rate logic — that is Convert-specific and does not
 * apply to this UI. */
export function canSubmitSwap(params: {
  from: BridgeLeg | null;
  to: BridgeLeg | null;
  parsedAmount: number;
  quote: BridgeQuote | null;
  quoteLoading: boolean;
  quoteError: unknown;
  isQuoteExpired: boolean;
  hasInsufficientBalance: boolean;
}): boolean {
  const {
    from,
    to,
    parsedAmount,
    quote,
    quoteLoading,
    quoteError,
    isQuoteExpired,
    hasInsufficientBalance,
  } = params;
  return (
    !!from &&
    !!to &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    !hasInsufficientBalance &&
    !isQuoteExpired &&
    !!quote &&
    !quoteLoading &&
    !quoteError
  );
}

/** True only when a quote attempt actually ran and came back with no route —
 * mirrors BridgeForm's noRailAvailable so an unauthenticated/not-ready query
 * (which also leaves quote null) isn't shown as a dead route. */
export function noSwapRailAvailable(params: {
  from: BridgeLeg | null;
  to: BridgeLeg | null;
  parsedAmount: number;
  quote: BridgeQuote | null;
  quoteFetched: boolean;
  quoteLoading: boolean;
  quoteError: unknown;
  hasInsufficientBalance: boolean;
}): boolean {
  const {
    from,
    to,
    parsedAmount,
    quote,
    quoteFetched,
    quoteLoading,
    quoteError,
    hasInsufficientBalance,
  } = params;
  return (
    !hasInsufficientBalance &&
    quoteFetched &&
    !quoteLoading &&
    !quoteError &&
    quote === null &&
    !!from &&
    !!to &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0
  );
}

/** "1 {from} ~ {rate} {to}" live-rate label for the footer / quote card. */
export function formatSwapRateLabel(
  fromSymbol: string | undefined,
  toSymbol: string | undefined,
  amountIn: string,
  amountOut: string,
): string | null {
  if (!fromSymbol || !toSymbol) return null;
  const inNum = parseFloat(amountIn);
  const outNum = parseFloat(amountOut);
  if (!Number.isFinite(inNum) || inNum <= 0 || !Number.isFinite(outNum)) {
    return null;
  }
  const rate = outNum / inNum;
  return `1 ${fromSymbol} ~ ${formatTokenAmount(rate)} ${toSymbol}`;
}

/** Figma tokenSelect: accent/gray-bolder pill (#f7f7f8 / white 10% superdark),
 * 6px padding around a 24px icon, General Sans Medium 14 symbol, 16px chevron. */
const tokenPillClasses =
  "flex shrink-0 items-center gap-0 rounded-full bg-accent-gray transition-all hover:bg-gray-100 active:scale-95 dark:bg-white/10 dark:hover:bg-white/15";

/** Amount: Figma draws the empty "0" in General Sans Medium (placeholder
 * colour) and the filled value per entry point — Inter Medium on Home
 * (frame 70), General Sans Medium on the token page (frame 63). Both 24/36,
 * tracking -0.72. */
const amountBaseClasses =
  "min-w-0 text-2xl font-medium leading-9 tracking-[-0.72px]";

interface SwapAmountCardProps {
  testId: string;
  label: string;
  tokenItems: BridgePickerItem[];
  selectedSymbol?: string;
  onSelectToken: (symbol: string) => void;
  /** Editable amount (From card). Omit for a read-only quote display (to card). */
  amount?: string;
  onAmountChange?: (value: string) => void;
  /** Read-only display value — used for the "to" card, driven by the live quote. */
  displayAmount?: string;
  balanceLabel?: string;
  onMax?: () => void;
  hasError?: boolean;
  /** "home" = frames 69/70, "token" = frames 59/63. */
  variant?: "home" | "token";
}

export function SwapAmountCard({
  testId,
  label,
  tokenItems,
  selectedSymbol,
  onSelectToken,
  amount,
  onAmountChange,
  displayAmount,
  balanceLabel,
  onMax,
  hasError = false,
  variant = "home",
}: SwapAmountCardProps) {
  const isReadOnly = onAmountChange == null;
  const filledFont = variant === "home" ? "font-inter" : "font-general-sans";

  return (
    <div
      className="flex w-full flex-col gap-3.5 rounded-2xl bg-white px-4 py-3 dark:bg-surface-canvas"
      data-testid={testId}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="whitespace-nowrap font-general-sans text-sm font-normal leading-5 tracking-[-0.14px] text-text-secondary dark:text-white/50">
          {label}
        </p>
        {!isReadOnly && selectedSymbol ? (
          <div className="flex shrink-0 items-center gap-2">
            {balanceLabel ? (
              <span className="flex items-center gap-1.5 whitespace-nowrap font-general-sans text-sm font-normal leading-5 tracking-[-0.14px] text-black dark:text-white">
                <Wallet01Icon
                  className="size-4 shrink-0 text-icon-outline-secondary dark:text-white/50"
                  strokeWidth={1.5}
                  aria-hidden
                />
                {balanceLabel}
              </span>
            ) : null}
            {onMax ? (
              <button
                type="button"
                onClick={onMax}
                className="whitespace-nowrap font-general-sans text-sm font-medium leading-5 tracking-[-0.14px] text-lavender-500 transition-colors hover:text-lavender-600"
              >
                Max
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2">
        {isReadOnly ? (
          <span
            className={classNames(
              amountBaseClasses,
              "truncate",
              displayAmount
                ? `${filledFont} text-black dark:text-white`
                : "font-general-sans text-text-placeholder dark:text-white/30",
            )}
          >
            {displayAmount ? formatTokenAmount(displayAmount) : "0"}
          </span>
        ) : (
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => onAmountChange?.(e.target.value)}
            placeholder="0"
            aria-label={`${label} amount`}
            className={classNames(
              amountBaseClasses,
              "flex-1 bg-transparent outline-none placeholder:font-general-sans placeholder:text-text-placeholder dark:placeholder:text-white/30",
              amount ? filledFont : "font-general-sans",
              hasError
                ? "text-text-accent-red dark:text-accent-red"
                : "text-black dark:text-white",
            )}
          />
        )}

        <BridgePicker
          title={`Select ${label.toLowerCase()} token`}
          items={tokenItems}
          selectedId={selectedSymbol}
          onSelect={onSelectToken}
          menuWidth={240}
          trigger={({ isOpen, toggle }) => (
            <button
              type="button"
              onClick={toggle}
              aria-expanded={isOpen}
              aria-label={
                selectedSymbol
                  ? `${selectedSymbol} token`
                  : SWAP_COPY.selectToken
              }
              className={classNames(
                tokenPillClasses,
                // Home's empty pill is 8px padded (frame 69); token page keeps 6px (frame 59).
                !selectedSymbol && variant === "home" ? "p-2" : "p-1.5",
              )}
            >
              {selectedSymbol ? (
                <img
                  src={`/logos/${selectedSymbol.toLowerCase()}-logo.svg`}
                  alt=""
                  className="size-6 shrink-0 rounded-full"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : null}
              <span
                className={classNames(
                  "whitespace-nowrap px-1 text-sm font-medium leading-5 text-black dark:text-white",
                  selectedSymbol
                    ? "font-general-sans tracking-[-0.14px]"
                    : "font-inter",
                )}
              >
                {selectedSymbol || SWAP_COPY.selectToken}
              </span>
              <ArrowDown01Icon
                strokeWidth={1.5}
                aria-hidden
                className={classNames(
                  "size-4 shrink-0 transition-transform",
                  selectedSymbol || variant === "token"
                    ? "text-icon-outline-secondary dark:text-white/50"
                    : "text-black dark:text-white",
                  isOpen && "rotate-180",
                )}
              />
            </button>
          )}
        />
      </div>
    </div>
  );
}

function getNetworkImgSrc(network: (typeof networks)[0]): string {
  return typeof network.imageUrl === "string"
    ? network.imageUrl
    : (network.imageUrl as { light: string; dark: string }).dark;
}

interface SwapNetworkCardProps {
  selectedNetworkName: string | null;
  onSelect: (name: string) => void;
}

/** Figma frame 69/70: "Select network" heading over a full-width 44px input,
 * sitting inside the same 20px-radius shell as the From/to cards. */
export function SwapNetworkCard({
  selectedNetworkName,
  onSelect,
}: SwapNetworkCardProps) {
  const items: BridgePickerItem[] = useMemo(
    () =>
      networks.map((n) => ({
        id: n.chain.name,
        label: n.chain.name,
        imgSrc: getNetworkImgSrc(n),
      })),
    [],
  );
  const selectedNetwork = networks.find(
    (n) => n.chain.name === selectedNetworkName,
  );
  const previewNetworks = networks.slice(0, 3);

  return (
    <div
      className="flex w-full flex-col justify-end gap-4 rounded-2xl border-[0.3px] border-border-light bg-white p-4 dark:border-white/10 dark:bg-surface-canvas"
      data-testid="swap-network-card"
    >
      <p className="whitespace-nowrap font-general-sans text-base font-medium leading-6 text-black dark:text-white">
        {SWAP_COPY.selectNetwork}
      </p>
      <BridgePicker
        title="Select network"
        items={items}
        selectedId={selectedNetworkName ?? undefined}
        onSelect={onSelect}
        menuWidth={294}
        trigger={({ isOpen, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={isOpen}
            aria-label={SWAP_COPY.selectNetwork}
            className={classNames(
              "flex h-11 w-full items-center rounded-xl border border-border-input bg-white px-2 py-2.5 text-left shadow-[0px_0px_1px_rgba(18,18,23,0.02)] transition-colors hover:border-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500 dark:border-white/20 dark:bg-transparent dark:hover:border-white/40",
            )}
          >
            {selectedNetwork ? (
              <span className="flex shrink-0 items-center pl-1">
                <img
                  src={getNetworkImgSrc(selectedNetwork)}
                  alt=""
                  className="size-[18px] shrink-0 rounded-full"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </span>
            ) : (
              <span className="flex shrink-0 items-center pl-1" aria-hidden>
                {previewNetworks.map((n, i) => (
                  <img
                    key={n.chain.name}
                    src={getNetworkImgSrc(n)}
                    alt=""
                    className={classNames(
                      "size-[18px] shrink-0 rounded-full",
                      i < previewNetworks.length - 1 && "-mr-1.5",
                    )}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ))}
              </span>
            )}
            <span
              className={classNames(
                "min-w-0 flex-1 truncate px-2 font-inter text-sm font-normal leading-6",
                selectedNetworkName
                  ? "text-black opacity-80 dark:text-white"
                  : "text-text-placeholder dark:text-white/30",
              )}
            >
              {selectedNetworkName ?? SWAP_COPY.selectNetwork}
            </span>
            <span className="flex shrink-0 pr-1">
              <ArrowDown01Icon
                className={classNames(
                  "size-[18px] shrink-0 text-icon-outline-secondary transition-transform dark:text-white/50",
                  isOpen && "rotate-180",
                )}
                strokeWidth={1.5}
                aria-hidden
              />
            </span>
          </button>
        )}
      />
    </div>
  );
}

interface SwapQuoteCardProps {
  rateLabel: string;
  receiveLabel: string;
  feeLabel: string;
}

const labelClasses =
  "font-inter text-xs font-medium leading-5 tracking-[-0.12px] text-text-secondary dark:text-white/50";

/** Figma frame 70 quote summary — only rendered when a live quote exists. */
export function SwapQuoteCard({
  rateLabel,
  receiveLabel,
  feeLabel,
}: SwapQuoteCardProps) {
  return (
    <div
      className="flex w-full flex-col gap-4 rounded-xl border-[0.3px] border-border-light bg-background-neutral p-5 dark:border-white/10 dark:bg-white/[0.05]"
      data-testid="swap-quote-card"
    >
      <div className="flex items-center justify-between gap-3 whitespace-nowrap">
        <span className={labelClasses}>{SWAP_COPY.exchangeRate}</span>
        <span className="font-inter text-xs font-medium leading-6 text-black dark:text-white">
          {rateLabel}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 whitespace-nowrap">
        <span className={labelClasses}>{SWAP_COPY.receiveAtLeast}</span>
        <span className="font-inter text-sm font-medium leading-5 tracking-[-0.14px] text-text-body dark:text-white/80">
          {receiveLabel}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 whitespace-nowrap">
        <span className={labelClasses}>{SWAP_COPY.fee}</span>
        <span className="font-inter text-sm font-medium leading-5 tracking-[-0.14px] text-text-body dark:text-white/80">
          {feeLabel}
        </span>
      </div>
    </div>
  );
}

interface TokenPillProps {
  symbol: string;
  amount: string;
}

/** Frame 96/98 pills: 24px token icon + amount only (no symbol), Inter Medium 14/20. */
export function SwapTokenAmountPill({ symbol, amount }: TokenPillProps) {
  return (
    <div className="flex shrink-0 items-center rounded-full bg-accent-gray p-1.5 dark:bg-white/10">
      <img
        src={`/logos/${symbol.toLowerCase()}-logo.svg`}
        alt=""
        className="size-6 shrink-0 rounded-full"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
      <span className="whitespace-nowrap px-1 font-inter text-sm font-medium leading-5 text-black dark:text-white">
        {formatTokenAmount(amount)}
      </span>
    </div>
  );
}

/** From → To pill pair with the 16px right arrow, 10px gaps (frame 96/98). */
export function SwapPillPair({
  fromSymbol,
  fromAmount,
  toSymbol,
  toAmount,
}: {
  fromSymbol: string;
  fromAmount: string;
  toSymbol: string;
  toAmount: string;
}) {
  return (
    <div className="flex items-center justify-center gap-2.5">
      <SwapTokenAmountPill symbol={fromSymbol} amount={fromAmount} />
      <ArrowRight02Icon
        className="size-4 shrink-0 text-icon-outline-secondary dark:text-white/50"
        strokeWidth={1.5}
        aria-hidden
      />
      <SwapTokenAmountPill symbol={toSymbol} amount={toAmount} />
    </div>
  );
}

const rowLabelClasses =
  "whitespace-nowrap font-inter text-sm font-normal leading-5 tracking-[-0.14px] text-text-secondary dark:text-white/50";
const rowValueClasses =
  "whitespace-nowrap text-right font-inter text-sm font-medium leading-5 tracking-[-0.14px] text-text-body dark:text-white/80";

export interface SwapReviewContentProps {
  titleId?: string;
  onClose: () => void;
  onConfirm: () => void;
  fromSymbol: string;
  fromAmount: string;
  toSymbol: string;
  toAmount: string;
  feeLabel: string;
  isSubmitting?: boolean;
}

/** Frame 96 (selectCurrency 385×404): 20px padding, 28px between every
 * section — title row, pills, You pay / Fees, divider, warning, Swap CTA. */
export function SwapReviewContent({
  titleId,
  onClose,
  onConfirm,
  fromSymbol,
  fromAmount,
  toSymbol,
  toAmount,
  feeLabel,
  isSubmitting = false,
}: SwapReviewContentProps) {
  const fallbackId = useId();
  const resolvedTitleId = titleId ?? fallbackId;

  return (
    <div
      className="flex w-full flex-col gap-7"
      data-testid="swap-review-content"
    >
      <div className="flex items-start justify-between">
        <h2
          id={resolvedTitleId}
          className={classNames("font-general-sans", drawerModalTitleClasses)}
        >
          {SWAP_COPY.reviewTitle}
        </h2>
        <button
          type="button"
          aria-label="Close"
          className={drawerCloseButtonClasses}
          onClick={onClose}
        >
          <Cancel01Icon className="size-5" strokeWidth={2} aria-hidden />
        </button>
      </div>

      <SwapPillPair
        fromSymbol={fromSymbol}
        fromAmount={fromAmount}
        toSymbol={toSymbol}
        toAmount={toAmount}
      />

      <div className="flex w-full flex-col gap-4">
        <div className="flex w-full items-center justify-between gap-3">
          <span className={rowLabelClasses}>{SWAP_COPY.youPay}</span>
          <span className="flex min-w-0 items-center justify-end gap-1">
            {fromSymbol ? (
              <img
                src={`/logos/${fromSymbol.toLowerCase()}-logo.svg`}
                alt=""
                className="size-3.5 shrink-0 rounded-full"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : null}
            <span className={rowValueClasses}>
              {formatTokenAmount(fromAmount)} {fromSymbol}
            </span>
          </span>
        </div>
        <div className="flex w-full items-center justify-between gap-3">
          <span className={rowLabelClasses}>{SWAP_COPY.fees}</span>
          <span className={rowValueClasses}>{feeLabel}</span>
        </div>
      </div>

      <hr className={classNames("w-full border-t", drawerDividerClasses)} />

      <div className="flex w-full gap-2.5 overflow-hidden rounded-xl border-[0.3px] border-border-light bg-background-neutral p-3 dark:border-white/10 dark:bg-white/5">
        <span className="flex shrink-0 items-start py-0.5">
          <InformationSquareIcon
            className="size-4 shrink-0 text-icon-outline-secondary dark:text-white/50"
            strokeWidth={1.5}
            aria-hidden
          />
        </span>
        <p className="min-w-0 flex-1 font-inter text-sm font-normal leading-5 text-text-secondary dark:text-white/50">
          {SWAP_COPY.warning}
        </p>
      </div>

      <button
        type="button"
        data-testid="swap-review-confirm"
        onClick={onConfirm}
        disabled={isSubmitting}
        className="flex h-10 w-full items-center justify-center rounded-xl bg-lavender-500 px-3 py-2.5 font-general-sans text-sm font-medium leading-5 tracking-[-0.14px] text-white transition-colors hover:bg-lavender-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500 disabled:cursor-not-allowed disabled:bg-border-input dark:disabled:bg-[#2e2e2e] dark:disabled:text-white/50"
      >
        {isSubmitting ? "Swapping…" : SWAP_COPY.swapCta}
      </button>
    </div>
  );
}

export interface SwapResultRow {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}

export interface SwapResultContentProps {
  titleId?: string;
  status: "success" | "failed";
  title: string;
  fromSymbol: string;
  fromAmount: string;
  toSymbol: string;
  toAmount: string;
  rows: SwapResultRow[];
  failureMessage?: string | null;
  explorerLink?: string;
  onPrimary: () => void;
  primaryLabel: string;
  /** Home (frame 98): centered modal, View in explorer text link + gray Close.
   * Token page (frame 65): in-drawer receipt card with stacked amounts and
   * View on explorer / Done footer buttons. */
  presentation?: "overlay" | "inline";
}

/** Figma checkmark-circle-01, 40px, #227738 / #39C65D, 2px rendered stroke. */
function SuccessIcon() {
  return (
    <CheckmarkCircle01Icon
      className={classNames("size-10 shrink-0", drawerSuccessIconClasses)}
      strokeWidth={1.2}
      aria-hidden
    />
  );
}

function FailedIcon() {
  return (
    <div className="flex size-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
      <SadDizzyIcon className="size-8 text-red-500 dark:text-red-400" />
    </div>
  );
}

const grayButtonClasses =
  "flex w-full items-center justify-center rounded-xl bg-accent-gray px-3 font-general-sans text-sm font-medium leading-5 tracking-[-0.14px] text-black transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500 dark:bg-white/10 dark:text-white dark:hover:bg-white/15";

const lavenderButtonClasses =
  "flex w-full items-center justify-center rounded-xl bg-lavender-500 px-3 font-general-sans text-sm font-medium leading-5 tracking-[-0.14px] text-white transition-colors hover:bg-lavender-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500";

/** Frame 98 — Home "Swap successful" modal body (the modal shell supplies
 * 34px top / 20px side+bottom padding and the 32px radius). */
function OverlayResult({
  resolvedTitleId,
  status,
  title,
  fromSymbol,
  fromAmount,
  toSymbol,
  toAmount,
  rows,
  failureMessage,
  explorerLink,
  onPrimary,
  primaryLabel,
}: SwapResultContentProps & { resolvedTitleId: string }) {
  const isSuccess = status === "success";
  return (
    <div
      className="flex w-full flex-col items-center gap-5 text-center"
      data-testid={isSuccess ? "swap-success-content" : "swap-failed-content"}
    >
      {isSuccess ? <SuccessIcon /> : <FailedIcon />}

      <div className="flex w-full flex-col items-center gap-4">
        <p
          id={resolvedTitleId}
          className="w-full font-general-sans text-xl font-medium leading-7 text-text-body dark:text-white/80"
        >
          {title}
        </p>
        {isSuccess ? (
          <SwapPillPair
            fromSymbol={fromSymbol}
            fromAmount={fromAmount}
            toSymbol={toSymbol}
            toAmount={toAmount}
          />
        ) : (
          <p className="max-w-sm font-general-sans text-sm leading-5 text-text-secondary dark:text-white/50">
            {failureMessage ?? SWAP_COPY.failedMessage}
          </p>
        )}
      </div>

      {isSuccess ? (
        <>
          <div className="flex w-full flex-col items-center gap-4">
            <hr
              className={classNames(
                "w-full border-t",
                drawerDashedDividerClasses,
              )}
            />
            <dl className="flex w-[275px] max-w-full gap-[19px] overflow-hidden font-general-sans text-sm font-normal leading-5 tracking-[-0.14px]">
              <div className="flex min-w-0 flex-1 flex-col items-start gap-4 whitespace-nowrap text-text-secondary dark:text-white/50">
                {rows.map((row) => (
                  <dt key={row.label}>{row.label}</dt>
                ))}
              </div>
              <div className="flex min-w-0 flex-1 flex-col items-end gap-4 text-right">
                {rows.map((row) => (
                  <dd
                    key={row.label}
                    className={classNames(
                      "whitespace-nowrap",
                      row.valueClassName ??
                        "text-text-secondary dark:text-white/50",
                    )}
                  >
                    {row.value}
                  </dd>
                ))}
              </div>
            </dl>
            <hr
              className={classNames(
                "w-full border-t",
                drawerDashedDividerClasses,
              )}
            />
          </div>
          {explorerLink ? (
            <a
              href={explorerLink}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full font-general-sans text-sm font-normal leading-5 tracking-[-0.14px] text-lavender-500 hover:underline"
            >
              {SWAP_COPY.viewInExplorer}
              <span className="sr-only">(opens in new tab)</span>
            </a>
          ) : null}
        </>
      ) : null}

      <button
        type="button"
        onClick={onPrimary}
        className={classNames(
          isSuccess ? grayButtonClasses : lavenderButtonClasses,
          "h-[42px] py-1.5",
        )}
      >
        {primaryLabel}
      </button>
    </div>
  );
}

/** Frame 65 — token-page "Swap Complete" receipt inside the drawer body. */
function InlineResult({
  resolvedTitleId,
  status,
  title,
  fromSymbol,
  fromAmount,
  toSymbol,
  toAmount,
  rows,
  failureMessage,
  explorerLink,
  onPrimary,
  primaryLabel,
}: SwapResultContentProps & { resolvedTitleId: string }) {
  const isSuccess = status === "success";
  return (
    <div
      className="flex w-full flex-col gap-[42px] rounded-[24px] border border-border-light bg-white px-6 py-11 dark:border-white/[0.04] dark:bg-surface-overlay"
      data-testid={isSuccess ? "swap-success-content" : "swap-failed-content"}
    >
      <div className="flex w-full flex-col items-center gap-[31px]">
        <div className="flex flex-col items-center gap-[3px]">
          {isSuccess ? <SuccessIcon /> : <FailedIcon />}
          <p
            id={resolvedTitleId}
            className="whitespace-nowrap text-center font-inter text-[19px] font-medium leading-9 tracking-[-0.19px] text-black dark:text-white"
          >
            {title}
          </p>
        </div>

        {isSuccess ? (
          <>
            <div className="flex w-full flex-col items-start gap-2 overflow-hidden rounded-[20px] bg-background-neutral p-[18px] dark:bg-white/5">
              {[
                { symbol: fromSymbol, amount: fromAmount },
                { symbol: toSymbol, amount: toAmount },
              ].map((leg, i) => (
                <React.Fragment key={`${leg.symbol}-${i}`}>
                  {i === 1 ? (
                    <ArrowDown02Icon
                      className="size-5 shrink-0 text-icon-outline-secondary dark:text-white/50"
                      strokeWidth={1.5}
                      aria-hidden
                    />
                  ) : null}
                  <div className="flex w-full min-w-0 items-center gap-2.5">
                    <img
                      src={`/logos/${leg.symbol.toLowerCase()}-logo.svg`}
                      alt=""
                      className="size-6 shrink-0 rounded-full"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                    <span className="truncate font-general-sans text-2xl font-medium leading-9 tracking-[-0.72px] text-black dark:text-white">
                      {formatTokenAmount(leg.amount)} {leg.symbol}
                    </span>
                  </div>
                </React.Fragment>
              ))}
            </div>

            {rows.length > 0 ? (
              <div className="flex w-full flex-col rounded-2xl border border-border-light py-4 dark:border-white/10">
                <dl className="flex w-full flex-col gap-4 px-4">
                  {rows.map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between gap-3"
                    >
                      <dt className="whitespace-nowrap font-inter text-xs font-normal text-icon-outline-secondary dark:text-white/50">
                        {row.label}
                      </dt>
                      <dd
                        className={classNames(
                          "whitespace-nowrap text-right font-inter text-sm font-medium",
                          row.valueClassName ?? "text-black dark:text-white",
                        )}
                      >
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
          </>
        ) : (
          <p className="max-w-sm text-center font-general-sans text-sm leading-5 text-text-secondary dark:text-white/50">
            {failureMessage ?? SWAP_COPY.failedMessage}
          </p>
        )}
      </div>

      <div className="flex w-full gap-[15px]">
        {explorerLink ? (
          <a
            href={explorerLink}
            target="_blank"
            rel="noopener noreferrer"
            className={classNames(grayButtonClasses, "h-10 flex-1 py-2.5")}
          >
            {SWAP_COPY.viewOnExplorer}
            <span className="sr-only">(opens in new tab)</span>
          </a>
        ) : null}
        <button
          type="button"
          onClick={onPrimary}
          className={classNames(lavenderButtonClasses, "h-10 flex-1 py-2.5")}
        >
          {primaryLabel}
        </button>
      </div>
    </div>
  );
}

export function SwapResultContent(props: SwapResultContentProps) {
  const fallbackId = useId();
  const resolvedTitleId = props.titleId ?? fallbackId;
  return (props.presentation ?? "overlay") === "overlay" ? (
    <OverlayResult {...props} resolvedTitleId={resolvedTitleId} />
  ) : (
    <InlineResult {...props} resolvedTitleId={resolvedTitleId} />
  );
}

export interface SwapFormProps {
  onClose: () => void;
  onBridgeSubmit?: (info: BridgeSubmitInfo) => void;
  /** Token-page entry: preselects the From token on the page's own network. */
  preferredTokenSymbol?: string;
  /** Home has a single same-network "Select network" card; the token page
   * has none — the network is fixed to the page's token. */
  showNetworkPicker: boolean;
  fromLabel: string;
  toLabel: string;
  ctaLabel: string;
  /** Home opens a centered Review modal before executing (frame 96); the
   * token page's "Swap" CTA executes directly — Figma draws no review step
   * for that entry point. */
  confirmBeforeSubmit: boolean;
  /** Home overlays Review/Swap-successful as centered modals above the
   * still-visible form (frame 96/98). The token page swaps its drawer body
   * for the result inline (frame 65). */
  successPresentation: "overlay" | "inline";
  /** Token page's inner "Swap" heading inside the drawer body (frame 59);
   * Home has none — the drawer title/subtitle already say so. */
  innerHeading?: string;
}

type SwapStep = "form" | "review" | "failed" | "status";

function buildResultRows(
  status: "success" | "refunded",
  timeSpentSeconds: number,
): SwapResultRow[] {
  return [
    {
      label: SWAP_COPY.transactionStatus,
      value: status === "success" ? SWAP_COPY.completed : "Refunded",
      valueClassName:
        status === "success"
          ? "text-[#227738] dark:text-[#39c65d]"
          : "text-text-accent-red dark:text-accent-red",
    },
    {
      label: SWAP_COPY.fundStatus,
      value: status === "success" ? SWAP_COPY.swapped : "Refunded to wallet",
    },
    {
      label: SWAP_COPY.timeSpent,
      value: `${timeSpentSeconds} second${timeSpentSeconds === 1 ? "" : "s"}`,
    },
  ];
}

/** Frame 65 receipt rows: Transaction fee (receiving token) and Date. */
function buildReceiptRows(
  info: { fee: number; toToken: string } | null,
  completedAt: Date | null,
): SwapResultRow[] {
  const rows: SwapResultRow[] = [];
  if (info) {
    rows.push({
      label: SWAP_COPY.transactionFee,
      value: `${info.fee} ${info.toToken}`,
    });
  }
  if (completedAt) {
    const date = completedAt.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const time = completedAt.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    rows.push({ label: SWAP_COPY.date, value: `${date} · ${time}` });
  }
  return rows;
}

export const SwapForm: React.FC<SwapFormProps> = ({
  onClose,
  onBridgeSubmit,
  preferredTokenSymbol,
  showNetworkPicker,
  fromLabel,
  toLabel,
  ctaLabel,
  confirmBeforeSubmit,
  successPresentation,
  innerHeading,
}) => {
  const reviewTitleId = useId();
  const resultTitleId = useId();
  const { authenticated, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const {
    isInjectedWallet,
    injectedAddress,
    injectedReady,
    injectedProvider,
    getInjectedToken,
  } = useInjectedWallet();

  // Opening Swap is an explicit user action — establish the injected SIWE
  // session up front, the same way BridgeForm does, so quote polling can read
  // the token passively without ever popping a wallet prompt.
  useEffect(() => {
    if (isInjectedWallet && injectedReady) {
      void getInjectedToken({ interactive: true });
    }
  }, [isInjectedWallet, injectedReady, getInjectedToken]);

  const getInjectedTokenPassive = useCallback(
    () => getInjectedToken({ interactive: false }),
    [getInjectedToken],
  );
  const getInjectedTokenInteractive = useCallback(
    () => getInjectedToken({ interactive: true }),
    [getInjectedToken],
  );

  const walletAddress = useWalletAddress();
  const { selectedNetwork } = useNetwork();
  const starknet = useStarknet();
  const { allTokens } = useTokens();
  const { signDelegationAuthorization } = useDelegationContractAuth();
  const {
    refreshBalance,
    crossChainBalances,
    isLoading: isBalanceLoading,
  } = useBalance();

  const [step, setStep] = useState<SwapStep>("form");
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const [isQuoteExpired, setIsQuoteExpired] = useState(false);
  const [networkName, setNetworkName] = useState<string | null>(
    showNetworkPicker ? null : selectedNetwork.chain.name,
  );
  const [fromSymbol, setFromSymbol] = useState<string | null>(
    preferredTokenSymbol ?? (showNetworkPicker ? "USDT" : null),
  );
  const [toSymbol, setToSymbol] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [timeSpentSeconds, setTimeSpentSeconds] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [completedAt, setCompletedAt] = useState<Date | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const [resultInfo, setResultInfo] = useState<{
    txHash: string;
    depositRefId: string;
    engine: BridgeEngine;
    fromToken: string;
    toToken: string;
    amountSent: string;
    amountReceived: string;
    fee: number;
  } | null>(null);

  // Preselect the From token on the page's own (fixed) network — mirrors
  // BridgeForm's preferredTokenSymbol effect.
  useEffect(() => {
    if (!preferredTokenSymbol || fromSymbol || !networkName) return;
    const tokenList = allTokens[networkName] ?? [];
    const match = tokenList.find((t) =>
      tokensEqual(t.symbol, preferredTokenSymbol),
    );
    if (!match) return;
    setFromSymbol(match.symbol);
  }, [preferredTokenSymbol, fromSymbol, networkName, allTokens]);

  const from = useMemo(
    () => buildSwapLeg(networkName, fromSymbol, allTokens),
    [networkName, fromSymbol, allTokens],
  );
  const to = useMemo(
    () => buildSwapLeg(networkName, toSymbol, allTokens),
    [networkName, toSymbol, allTokens],
  );

  const networkObj = useMemo(
    () => networks.find((n) => n.chain.name === networkName) ?? selectedNetwork,
    [networkName, selectedNetwork],
  );

  const slippageBps = parseInt(
    process.env.NEXT_PUBLIC_BRIDGE_DEFAULT_SLIPPAGE_BPS ?? "50",
    10,
  );

  const tokenItems: BridgePickerItem[] = useMemo(
    () =>
      (allTokens[networkName ?? ""] ?? []).map((t) => ({
        id: t.symbol,
        label: t.symbol,
        imgSrc: `/logos/${t.symbol.toLowerCase()}-logo.svg`,
        sub: t.name,
      })),
    [allTokens, networkName],
  );

  const fromBalanceEntry = useMemo(() => {
    if (!from) return null;
    return crossChainBalances.find(
      (b) => b.network.chain.name === from.network,
    );
  }, [from, crossChainBalances]);

  const isFromBalanceKnown = useMemo(() => {
    if (!from) return false;
    if (isBalanceLoading) return false;
    return fromBalanceEntry !== undefined;
  }, [from, fromBalanceEntry, isBalanceLoading]);

  const fromBalance = useMemo(() => {
    if (!from || !fromBalanceEntry) return 0;
    const key = from.token.toUpperCase();
    return (
      fromBalanceEntry.balances.rawBalances?.[key] ??
      fromBalanceEntry.balances.rawBalances?.[from.token] ??
      fromBalanceEntry.balances.balances[key] ??
      fromBalanceEntry.balances.balances[from.token] ??
      0
    );
  }, [from, fromBalanceEntry]);

  const parsedAmount = Number(amount);
  const hasInsufficientBalance =
    isFromBalanceKnown &&
    !!from &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    parsedAmount > fromBalance;

  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");
  const evmAddress = isInjectedWallet
    ? injectedReady
      ? (injectedAddress ?? "")
      : ""
    : (embeddedWallet?.address ?? "");
  const starknetAddress = starknet.address ?? "";

  const walletAdapter = useMemo(() => {
    if (
      isInjectedWallet &&
      injectedReady &&
      injectedAddress &&
      injectedProvider
    ) {
      return {
        switchChain: async (chainId: number) => {
          const chainIdHex = `0x${chainId.toString(16)}`;
          await injectedProvider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: chainIdHex }],
          });
        },
        getEthereumProvider: async () => injectedProvider,
        address: injectedAddress,
      };
    }
    if (embeddedWallet) {
      return {
        switchChain: embeddedWallet.switchChain.bind(embeddedWallet),
        getEthereumProvider:
          embeddedWallet.getEthereumProvider.bind(embeddedWallet),
        address: embeddedWallet.address,
      };
    }
    return undefined;
  }, [
    isInjectedWallet,
    injectedReady,
    injectedAddress,
    injectedProvider,
    embeddedWallet,
  ]);

  const {
    quote,
    isLoading: quoteLoading,
    isFetched: quoteFetched,
    error: quoteError,
  } = useBridgeQuote({
    from,
    to,
    amount,
    evmAddress,
    starknetAddress,
    slippageBps,
    enabled:
      (authenticated || (isInjectedWallet && injectedReady)) &&
      !!(evmAddress || starknetAddress) &&
      !hasInsufficientBalance,
    getAccessToken,
    getInjectedToken:
      isInjectedWallet && injectedReady ? getInjectedTokenPassive : undefined,
  });

  useEffect(() => {
    setIsQuoteExpired(false);
  }, [quote]);

  const { execute } = useBridgeExecute({
    selectedNetwork: networkObj,
    getAccessToken,
    starknetWallet: {
      walletId: starknet.walletId,
      publicKey: starknet.publicKey,
      address: starknet.address,
      deployed: starknet.deployed,
    },
    embeddedWallet: walletAdapter,
    allTokens,
    signDelegationAuthorization,
    isInjectedWallet: isInjectedWallet && injectedReady,
    injectedProvider:
      isInjectedWallet && injectedReady ? injectedProvider : null,
    injectedAddress: isInjectedWallet && injectedReady ? injectedAddress : null,
    getInjectedToken:
      isInjectedWallet && injectedReady
        ? getInjectedTokenInteractive
        : undefined,
  });

  const { result: bridgeStatus } = useBridgeStatus({
    engine: resultInfo?.engine ?? null,
    refId: resultInfo?.depositRefId ?? null,
    enabled: step === "status" && !!resultInfo,
    getAccessToken,
    getInjectedToken:
      isInjectedWallet && injectedReady ? getInjectedTokenPassive : undefined,
  });
  const liveStatus = bridgeStatus?.status;
  const isDone = liveStatus === "SUCCESS";
  const isRefunded = liveStatus === "REFUNDED";
  const isStatusFailed = liveStatus === "FAILED";
  const isTerminal = isDone || isRefunded || isStatusFailed;

  useEffect(() => {
    if (!isTerminal) return;
    const startedAt = startedAtRef.current;
    setCompletedAt(new Date());
    setTimeSpentSeconds(
      startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : 0,
    );
  }, [isTerminal]);

  // Elapsed UI timer for the processing screen — display only, same as Transfer.
  useEffect(() => {
    if (step !== "status" || isTerminal) return;
    const tick = () => {
      const startedAt = startedAtRef.current;
      setElapsedSeconds(
        startedAt
          ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
          : 0,
      );
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [step, isTerminal]);

  const explorerLink = resultInfo
    ? isDone && bridgeStatus?.destinationTxHash && to
      ? getExplorerLink(to.network, bridgeStatus.destinationTxHash)
      : from
        ? getExplorerLink(from.network, resultInfo.txHash)
        : ""
    : "";

  const rateLabel = formatSwapRateLabel(
    from?.token,
    to?.token,
    amount,
    quote?.amountOut ?? "",
  );

  const noRailAvailable = noSwapRailAvailable({
    from,
    to,
    parsedAmount,
    quote,
    quoteFetched,
    quoteLoading,
    quoteError,
    hasInsufficientBalance,
  });

  const canConfirm = canSubmitSwap({
    from,
    to,
    parsedAmount,
    quote,
    quoteLoading,
    quoteError,
    isQuoteExpired,
    hasInsufficientBalance,
  });

  const resetToForm = () => {
    setStep("form");
    setFailureMessage(null);
    setIsFinalizing(false);
  };

  const handleNetworkSelect = (name: string) => {
    setNetworkName(name);
    const tokenList = allTokens[name] ?? [];
    setFromSymbol((prev) => {
      if (prev && tokenList.some((tok) => tokensEqual(tok.symbol, prev))) {
        return prev;
      }
      const usdt = tokenList.find((tok) => tokensEqual(tok.symbol, "USDT"));
      return usdt?.symbol ?? null;
    });
    setToSymbol(null);
    setAmount("");
  };

  const handleFlip = () => {
    setFromSymbol(toSymbol);
    setToSymbol(fromSymbol);
    setAmount("");
  };

  const handleMax = () => {
    if (fromBalance > 0) {
      setAmount(String(formatDecimalPrecision(fromBalance, 6)));
    }
  };

  const handleConfirm = async () => {
    if (!quote || !from || !to) return;
    const rawAmount = toRawAmount(amount, from.decimals);
    if (
      !Number.isFinite(parsedAmount) ||
      parsedAmount <= 0 ||
      rawAmount === "0"
    ) {
      setFailureMessage("Enter a valid amount for the selected token.");
      setStep("failed");
      return;
    }
    const fromWithAmount: BridgeLeg = { ...from, amount, rawAmount };
    try {
      setIsFinalizing(true);
      startedAtRef.current = Date.now();
      setElapsedSeconds(0);
      setStep("status");
      const { txHash, depositRefId } = await execute(quote, fromWithAmount);
      const resolvedEngine = engineFromQuote(quote);

      const accessToken = isInjectedWallet ? null : await getAccessToken();
      const injectedToken = isInjectedWallet
        ? await getInjectedToken({ interactive: true })
        : null;
      if ((accessToken || injectedToken) && walletAddress) {
        await saveTransaction(
          {
            walletAddress,
            transactionType: "bridge",
            fromCurrency: from.token,
            toCurrency: to.token,
            amountSent: parsedAmount,
            amountReceived: parseFloat(quote.amountOut),
            fee: bridgeFeeInReceivingToken(quote),
            recipient: {
              account_name: "Swap",
              institution: bridgeInstitutionLabel(quote),
              account_identifier: txHash,
              to_network: to.network,
            },
            status: "pending",
            network: from.network,
            txHash,
            orderId: depositRefId,
          },
          accessToken,
          injectedToken,
        )
          .then((saved) => {
            if (saved?.data?.id) {
              onBridgeSubmit?.({
                savedTxId: saved.data.id,
                engine: resolvedEngine,
                depositRefId,
              });
            }
          })
          .catch(() => null);
      }

      setResultInfo({
        txHash,
        depositRefId,
        engine: resolvedEngine,
        fromToken: from.token,
        toToken: to.token,
        amountSent: amount,
        amountReceived: quote.amountOut,
        fee: bridgeFeeInReceivingToken(quote),
      });
      setStep("status");
    } catch (err) {
      mapReportAndAct(err, {
        feature: "swap",
        onUserMessage: (message) => setFailureMessage(message),
      });
      setIsFinalizing(false);
      refreshBalance();
      setStep("failed");
    }
  };

  const handleCtaClick = () => {
    if (!canConfirm) return;
    if (confirmBeforeSubmit) {
      setStep("review");
    } else {
      void handleConfirm();
    }
  };

  const handleResultDone = () => {
    refreshBalance();
    resetToForm();
    setAmount("");
    onClose();
  };

  const showQuoteCard =
    !!quote && !!to && !quoteLoading && !hasInsufficientBalance && !quoteError;

  const formBody = (
    <div
      className={classNames(
        "flex w-full flex-col",
        showNetworkPicker ? "gap-3" : "gap-2",
      )}
      data-testid="swap-form-body"
    >
      {/* Frame 1000003092: one 20px-radius shell holding the (token-page)
          heading, From/to cards, flip control and (Home) network card. */}
      <div className="relative flex w-full flex-col gap-2 rounded-[20px] bg-background-neutral p-2 dark:bg-white/[0.05]">
        {innerHeading ? (
          <div className="flex w-full items-center gap-1.5 pl-2 pr-1">
            <h3 className="whitespace-nowrap font-general-sans text-base font-semibold leading-6 text-black dark:text-white">
              {innerHeading}
            </h3>
          </div>
        ) : null}

        <SwapAmountCard
          testId="swap-from-card"
          label={fromLabel}
          tokenItems={tokenItems}
          selectedSymbol={fromSymbol ?? from?.token}
          onSelectToken={(symbol) => setFromSymbol(symbol)}
          amount={amount}
          onAmountChange={setAmount}
          balanceLabel={
            fromSymbol
              ? isFromBalanceKnown
                ? `${formatTokenAmount(fromBalance)} ${fromSymbol}`
                : undefined
              : undefined
          }
          onMax={handleMax}
          hasError={hasInsufficientBalance}
          variant={showNetworkPicker ? "home" : "token"}
        />

        <SwapAmountCard
          testId="swap-to-card"
          label={toLabel}
          tokenItems={tokenItems}
          selectedSymbol={to?.token}
          onSelectToken={(symbol) => setToSymbol(symbol)}
          displayAmount={quote?.amountOut}
          variant={showNetworkPicker ? "home" : "token"}
        />

        <button
          type="button"
          onClick={handleFlip}
          disabled={quoteLoading}
          aria-label={
            quoteLoading ? "Loading quote" : "Flip from and to tokens"
          }
          aria-busy={quoteLoading}
          className={classNames(
            "absolute left-[calc(50%-1px)] top-[130px] z-10 flex size-6 -translate-x-1/2 items-center justify-center rounded-lg border-4 border-background-neutral bg-white p-0.5 dark:border-[#202020] dark:bg-surface-canvas",
            quoteLoading
              ? "cursor-wait"
              : "transition-transform hover:scale-105 active:scale-95",
          )}
        >
          {quoteLoading ? (
            <Loading03Icon
              className="size-5 shrink-0 animate-spin text-icon-outline-secondary motion-reduce:animate-none dark:text-white/50"
              strokeWidth={1.5}
              aria-hidden
            />
          ) : (
            <ArrowDataTransferVerticalIcon
              className="size-5 shrink-0 text-icon-outline-secondary dark:text-white/50"
              strokeWidth={1.5}
              aria-hidden
            />
          )}
        </button>

        {showNetworkPicker ? (
          <SwapNetworkCard
            selectedNetworkName={networkName}
            onSelect={handleNetworkSelect}
          />
        ) : null}
      </div>

      {hasInsufficientBalance ? (
        <div className="rounded-xl border border-red-100 bg-red-50 p-3 font-general-sans text-sm text-red-600 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-400">
          Insufficient balance
        </div>
      ) : null}

      {noRailAvailable ? (
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 font-general-sans text-sm text-amber-700 dark:border-amber-900/30 dark:bg-amber-900/20 dark:text-amber-400">
          {SWAP_COPY.noRail}
        </div>
      ) : null}

      {showQuoteCard && quote && to ? (
        <SwapQuoteCard
          rateLabel={rateLabel ?? ""}
          receiveLabel={`${formatTokenAmount(quote.amountOut)} ${to.token}`}
          feeLabel={`${bridgeFeeInReceivingToken(quote)} ${to.token}`}
        />
      ) : null}

      <div
        className={classNames(
          "flex w-full flex-col",
          showNetworkPicker ? "gap-5" : "gap-2",
        )}
      >
        <button
          type="button"
          data-testid="swap-submit-cta"
          disabled={!canConfirm}
          onClick={handleCtaClick}
          className={classNames(
            "flex h-11 w-full items-center justify-center rounded-xl px-3 py-2.5 font-general-sans text-sm font-medium leading-5 tracking-[-0.14px] text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500",
            "bg-lavender-500 hover:bg-lavender-600 disabled:cursor-not-allowed disabled:bg-border-input disabled:text-white dark:disabled:bg-[#2e2e2e] dark:disabled:text-white/50",
          )}
        >
          {ctaLabel}
        </button>

        {/* btmSec: two 4px-padded tags joined by a 0.3px fading rule. */}
        <div className="flex w-full items-center gap-1 overflow-hidden py-2 font-general-sans text-xs font-normal leading-4 text-text-disabled dark:text-white/30">
          <span className="shrink-0 whitespace-nowrap py-1">
            {rateLabel ?? ""}
          </span>
          <span
            aria-hidden
            className="h-[0.3px] min-w-px flex-1 bg-gradient-to-r from-transparent to-border-light dark:to-white/10"
          />
          <span className="shrink-0 whitespace-nowrap py-1 pl-1">
            {SWAP_COPY.etaFallback}
          </span>
        </div>
      </div>
    </div>
  );

  const isPending = step === "status" && !isTerminal;
  const pendingFromSymbol = resultInfo?.fromToken ?? from?.token ?? "";
  const pendingToSymbol = resultInfo?.toToken ?? to?.token ?? "";
  const pendingFromAmount = resultInfo?.amountSent ?? amount;
  const pendingToAmount = resultInfo?.amountReceived ?? quote?.amountOut ?? "";

  const pendingModal = (
    <TransferPendingModal
      isOpen={isPending}
      onClose={resetToForm}
      amountLabel={
        pendingFromAmount ? formatTokenAmount(pendingFromAmount) : ""
      }
      tokenSymbol={pendingFromSymbol}
      tokenImageUrl={
        pendingFromSymbol
          ? `/logos/${pendingFromSymbol.toLowerCase()}-logo.svg`
          : undefined
      }
      shortAddress={
        pendingToSymbol
          ? pendingToAmount
            ? `${formatTokenAmount(pendingToAmount)} ${pendingToSymbol}`
            : pendingToSymbol
          : ""
      }
      destinationImageUrl={
        pendingToSymbol
          ? `/logos/${pendingToSymbol.toLowerCase()}-logo.svg`
          : undefined
      }
      elapsedSeconds={elapsedSeconds}
      title={SWAP_COPY.pendingTitle}
      note={SWAP_COPY.pendingNote}
      testId="swap-pending-content"
    />
  );

  const failedBody = (
    <SwapResultContent
      titleId={resultTitleId}
      status="failed"
      title={SWAP_COPY.failedTitle}
      fromSymbol={from?.token ?? ""}
      fromAmount={amount}
      toSymbol={to?.token ?? ""}
      toAmount={resultInfo?.amountReceived ?? ""}
      rows={[]}
      failureMessage={failureMessage}
      onPrimary={resetToForm}
      primaryLabel={SWAP_COPY.tryAgain}
      presentation={successPresentation}
    />
  );

  const statusFailedBody = (
    <SwapResultContent
      titleId={resultTitleId}
      status="failed"
      title={SWAP_COPY.failedTitle}
      fromSymbol={resultInfo?.fromToken ?? ""}
      fromAmount={resultInfo?.amountSent ?? ""}
      toSymbol={resultInfo?.toToken ?? ""}
      toAmount={resultInfo?.amountReceived ?? ""}
      rows={[]}
      failureMessage={
        isRefunded
          ? "The swap couldn't be completed, so your funds were refunded."
          : "The swap failed. Any funds that left your wallet will be refunded."
      }
      explorerLink={explorerLink || undefined}
      onPrimary={handleResultDone}
      primaryLabel={SWAP_COPY.done}
      presentation={successPresentation}
    />
  );

  const successBody = (
    <SwapResultContent
      titleId={resultTitleId}
      status="success"
      title={
        successPresentation === "overlay"
          ? SWAP_COPY.successTitle
          : SWAP_COPY.completeTitle
      }
      fromSymbol={resultInfo?.fromToken ?? ""}
      fromAmount={resultInfo?.amountSent ?? ""}
      toSymbol={resultInfo?.toToken ?? ""}
      toAmount={resultInfo?.amountReceived ?? ""}
      rows={
        successPresentation === "overlay"
          ? buildResultRows("success", timeSpentSeconds)
          : buildReceiptRows(resultInfo, completedAt)
      }
      explorerLink={explorerLink || undefined}
      onPrimary={handleResultDone}
      primaryLabel={
        successPresentation === "overlay" ? SWAP_COPY.close : SWAP_COPY.done
      }
      presentation={successPresentation}
    />
  );

  const statusBody = isDone ? successBody : statusFailedBody;

  if (successPresentation === "inline") {
    if (step === "failed") return failedBody;
    if (step === "status" && isTerminal) return statusBody;
    return (
      <>
        {formBody}
        {pendingModal}
      </>
    );
  }

  // Overlay presentation (Home): the filled form always stays visible behind
  // the dimmed Review / result modals (frame 96/98).
  return (
    <>
      {formBody}

      <AnimatedModal
        isOpen={step === "review"}
        onClose={resetToForm}
        maxWidth="385px"
        dialogPanelClassName="!bg-transparent !shadow-none"
        contentClassName="!rounded-[32px] !border !border-border-light !bg-white !p-5 !shadow-2xl dark:!border-white/10 dark:!bg-[#2b2b2b]"
        ariaLabelledBy={reviewTitleId}
        scrimClassName={drawerModalScrimClasses}
      >
        <SwapReviewContent
          titleId={reviewTitleId}
          onClose={resetToForm}
          onConfirm={() => void handleConfirm()}
          fromSymbol={from?.token ?? ""}
          fromAmount={amount}
          toSymbol={to?.token ?? ""}
          toAmount={quote?.amountOut ?? ""}
          feeLabel={
            quote
              ? `${bridgeFeeInReceivingToken(quote)} ${to?.token ?? ""}`
              : "—"
          }
          isSubmitting={isFinalizing}
        />
      </AnimatedModal>

      {pendingModal}

      <AnimatedModal
        isOpen={step === "failed" || (step === "status" && isTerminal)}
        onClose={step === "failed" ? resetToForm : handleResultDone}
        maxWidth="394px"
        dialogPanelClassName="!bg-transparent !shadow-none"
        contentClassName="!rounded-[32px] !border !border-border-light !bg-white !px-5 !pb-5 !pt-[34px] !shadow-2xl dark:!border-white/10 dark:!bg-[#2b2b2b]"
        ariaLabelledBy={resultTitleId}
        scrimClassName={drawerModalScrimClasses}
      >
        {step === "failed" ? failedBody : statusBody}
      </AnimatedModal>
    </>
  );
};
