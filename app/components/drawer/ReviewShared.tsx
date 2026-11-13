"use client";

import type { ReactNode } from "react";
import { Copy01Icon } from "hugeicons-react";
import { toast } from "sonner";

import { classNames } from "@/app/utils";

import {
  drawerBodyMediumText,
  drawerBorderLight,
  drawerCopyButtonClasses,
  drawerDetailCardInnerClasses,
  drawerDividerClasses,
  drawerIconMutedClasses,
  drawerNeutralCardClasses,
  drawerSecondaryText,
} from "./drawerStyles";
import { formatExpiryCountdown } from "./formatExpiryCountdown";
import type { ReviewDetailRow } from "./types";

type ReviewDetailCardProps = {
  rows: ReviewDetailRow[];
  expiresInSeconds?: number;
  /**
   * Pre-formatted "Expires in" value (e.g. an already-ticking "MM:SS" string
   * owned by the caller's own countdown effect) — used instead of
   * `expiresInSeconds` when the caller must not hand this component the raw
   * seconds (e.g. MakePayment's countdown effect is money-adjacent and must
   * stay untouched; this lets the row still render inside the card, matching
   * Figma, without duplicating that effect's math here).
   */
  expiresInLabel?: string;
  className?: string;
};

export function ReviewDetailCard({
  rows,
  expiresInSeconds,
  expiresInLabel,
  className,
}: ReviewDetailCardProps) {
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <div
      className={classNames(
        "flex w-full flex-col gap-3 rounded-2xl py-3",
        drawerNeutralCardClasses,
        className,
      )}
    >
      <div className="px-2">
        <div
          className={classNames(
            drawerDetailCardInnerClasses,
          )}
        >
          {rows.map((row, index) => (
            <div key={row.label}>
              {index > 0 ? (
                <hr className={classNames(drawerDividerClasses, drawerBorderLight)} />
              ) : null}
              <div className="flex items-start gap-3 p-4">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <p className={classNames("text-sm", drawerSecondaryText)}>
                    {row.label}
                  </p>
                  <p className={classNames("text-sm", drawerBodyMediumText)}>
                    {row.value}
                  </p>
                </div>
                {row.copyValue ? (
                  <button
                    type="button"
                    aria-label={`Copy ${row.label}`}
                    className={classNames(
                      drawerCopyButtonClasses,
                      drawerIconMutedClasses,
                    )}
                    onClick={() => copy(row.copyValue!)}
                  >
                    <Copy01Icon className="size-4" aria-hidden />
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
      {expiresInSeconds != null || expiresInLabel != null ? (
        <div className="flex items-center justify-between px-4 py-1 text-sm">
          <span className={drawerSecondaryText}>Expires in</span>
          <span
            className={classNames(
              "rounded-full border-[0.3px] border-border-light bg-white px-2 py-0.5 text-sm font-medium text-lavender-500",
              "dark:border-transparent dark:bg-lavender-500 dark:text-white",
            )}
          >
            {expiresInLabel ?? formatExpiryCountdown(expiresInSeconds!)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

type ReviewSummaryRowProps = {
  label: string;
  value: string;
  tokenSymbol?: string;
  valueIcon?: ReactNode;
};

export function ReviewSummaryRow({
  label,
  value,
  tokenSymbol,
  valueIcon,
}: ReviewSummaryRowProps) {
  return (
    <div className="flex w-full items-center justify-between gap-3 text-sm">
      <span className={drawerSecondaryText}>{label}</span>
      <span
        className={classNames(
          "flex items-center gap-2 font-medium",
          drawerBodyMediumText,
        )}
      >
        {valueIcon ? (
          <span className="flex size-3.5 shrink-0 items-center justify-center overflow-hidden rounded-full [&_img]:size-3.5 [&_svg]:size-3.5">
            {valueIcon}
          </span>
        ) : null}
        {value}
        {tokenSymbol ? ` ${tokenSymbol}` : ""}
      </span>
    </div>
  );
}
