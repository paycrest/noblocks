"use client";

import React, { useId } from "react";
import {
  ArrowRight02Icon,
  Cancel01Icon,
  InformationSquareIcon,
} from "hugeicons-react";
import { classNames, formatTokenAmount } from "@/app/utils";
import {
  drawerCloseButtonClasses,
  drawerDividerClasses,
  drawerModalTitleClasses,
} from "@/app/components/drawer/drawerStyles";
import { SWAP_COPY } from "./swapConfig";

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
    <div className="flex w-full flex-col gap-7" data-testid="swap-review-content">
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
