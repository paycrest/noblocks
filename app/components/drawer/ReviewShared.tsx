"use client";

import type { ReactNode } from "react";
import { Copy01Icon } from "hugeicons-react";
import { toast } from "sonner";

import { classNames } from "@/app/utils";

import { drawerBorderLight } from "./drawerStyles";
import type { ReviewDetailRow } from "./types";

type ReviewDetailCardProps = {
  rows: ReviewDetailRow[];
  expiresInLabel?: string;
  className?: string;
};

export function ReviewDetailCard({
  rows,
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
        "flex w-full flex-col gap-3 rounded-2xl bg-white/[0.05] py-3",
        className,
      )}
    >
      <div className="px-2">
        <div
          className={classNames(
            "overflow-hidden rounded-xl bg-[#141414]",
            drawerBorderLight,
          )}
        >
          {rows.map((row, index) => (
            <div key={row.label}>
              {index > 0 ? (
                <hr className={classNames("border-white/10", drawerBorderLight)} />
              ) : null}
              <div className="flex items-start gap-3 p-4">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <p className="text-sm text-white/50">{row.label}</p>
                  <p className="text-sm font-medium text-white/80">{row.value}</p>
                </div>
                {row.copyValue ? (
                  <button
                    type="button"
                    aria-label={`Copy ${row.label}`}
                    className="mt-1 shrink-0 text-white/50 transition-colors hover:text-lavender-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500"
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
      {expiresInLabel ? (
        <div className="flex items-center justify-between px-4 py-1 text-sm">
          <span className="text-white/50">Expires in</span>
          <span
            className={classNames(
              "rounded-full bg-[#141414] px-2 py-0.5 text-sm font-medium text-lavender-500",
              drawerBorderLight,
            )}
          >
            {expiresInLabel}
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
      <span className="text-white/50">{label}</span>
      <span className="flex items-center gap-2 font-medium text-white/80">
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
