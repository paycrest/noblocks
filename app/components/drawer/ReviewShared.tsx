"use client";

import { Copy01Icon } from "hugeicons-react";
import { toast } from "sonner";

import { classNames } from "@/app/utils";

import type { ReviewDetailRow } from "./types";

type ReviewDetailCardProps = {
  rows: ReviewDetailRow[];
  className?: string;
};

export function ReviewDetailCard({ rows, className }: ReviewDetailCardProps) {
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
        "rounded-2xl bg-white/[0.05] p-2",
        className,
      )}
    >
      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#141414]">
        {rows.map((row, index) => (
          <div key={row.label}>
            {index > 0 ? <hr className="border-white/10" /> : null}
            <div className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0 flex-1">
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
  );
}

type ReviewSummaryRowProps = {
  label: string;
  value: string;
  tokenSymbol?: string;
};

export function ReviewSummaryRow({
  label,
  value,
  tokenSymbol,
}: ReviewSummaryRowProps) {
  return (
    <div className="flex w-full items-center justify-between gap-3 text-sm">
      <span className="text-white/50">{label}</span>
      <span className="font-medium text-white/80">
        {value}
        {tokenSymbol ? ` ${tokenSymbol}` : ""}
      </span>
    </div>
  );
}
