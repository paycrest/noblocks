"use client";

import React, { useId } from "react";
import {
  ArrowDown02Icon,
  CheckmarkCircle01Icon,
  SadDizzyIcon,
} from "hugeicons-react";
import { classNames, formatTokenAmount } from "@/app/utils";
import {
  drawerDashedDividerClasses,
  drawerSuccessIconClasses,
} from "@/app/components/drawer/drawerStyles";
import { SwapPillPair } from "./SwapReviewContent";
import { SWAP_COPY } from "./swapConfig";

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
            <hr className={classNames("w-full border-t", drawerDashedDividerClasses)} />
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
                      row.valueClassName ?? "text-text-secondary dark:text-white/50",
                    )}
                  >
                    {row.value}
                  </dd>
                ))}
              </div>
            </dl>
            <hr className={classNames("w-full border-t", drawerDashedDividerClasses)} />
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
                    <div key={row.label} className="flex items-center justify-between gap-3">
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
