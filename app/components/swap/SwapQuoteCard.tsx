"use client";

import React from "react";
import { SWAP_COPY } from "./swapConfig";

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
