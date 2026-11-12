"use client";

import React from "react";
import { ArrowDown01Icon, Wallet01Icon } from "hugeicons-react";
import { classNames, formatTokenAmount } from "@/app/utils";
import { BridgePicker } from "@/app/components/bridge/BridgePicker";
import type { BridgePickerItem } from "@/app/components/bridge/BridgePicker";
import { SWAP_COPY } from "./swapConfig";

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
              aria-label={selectedSymbol ? `${selectedSymbol} token` : SWAP_COPY.selectToken}
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
