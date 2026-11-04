"use client";

import type { ReactNode } from "react";
import { Copy01Icon } from "hugeicons-react";
import { toast } from "sonner";

import { classNames } from "@/app/utils";

import {
  drawerBodyMediumText,
  drawerBorderLight,
  drawerCanvasClasses,
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
  className?: string;
};

export function ReviewDetailCard({
  rows,
  expiresInSeconds,
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
            "overflow-hidden rounded-xl",
            drawerCanvasClasses,
            drawerBorderLight,
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
                      "mt-1 shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500",
                      drawerIconMutedClasses,
                    )}
                    onClick={() => copy(row.copyValue!)}
                  >
                    <Copy01Icon className="size-4" />
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
      {expiresInSeconds != null ? (
        <div className="flex items-center justify-between px-4 py-1 text-sm">
          <span className={drawerSecondaryText}>Expires in</span>
          <span
            className={classNames(
              "rounded-full px-2 py-0.5 text-sm font-medium text-lavender-500",
              drawerCanvasClasses,
              drawerBorderLight,
            )}
          >
            {formatExpiryCountdown(expiresInSeconds)}
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
          <span className="flex size-3.5 shrink-0 items-center justify-center overflow-hidden rounded-full">
            {valueIcon}
          </span>
        ) : null}
        {value}
        {tokenSymbol ? ` ${tokenSymbol}` : ""}
      </span>
    </div>
  );
}
