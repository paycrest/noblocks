"use client";

import { classNames } from "@/app/utils";

import { getAllowlistedExplorerUrl } from "./explorer";
import type { ReceiptRow } from "./types";

export type ReceiptMetaRowsProps = {
  rows: ReceiptRow[];
  networkName: string;
  txHash?: string | null;
  explorerLinkLabel?: string;
  layout?: "drawer" | "modal";
};

export function ReceiptMetaRows({
  rows,
  networkName,
  txHash,
  explorerLinkLabel = "View in explorer",
  layout = "drawer",
}: ReceiptMetaRowsProps) {
  const explorerUrl = getAllowlistedExplorerUrl(networkName, txHash);

  const mergedRows = rows.map((row) => {
    if (row.label !== "Onchain receipt") {
      return row;
    }
    if (!explorerUrl) {
      return { ...row, value: null, hidden: true };
    }
    return {
      ...row,
      value: (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-lavender-500 hover:underline"
        >
          {explorerLinkLabel}
        </a>
      ),
    };
  });

  const visible = mergedRows.filter(
    (row) => !(row as ReceiptRow & { hidden?: boolean }).hidden,
  );

  if (layout === "modal") {
    return (
      <div className="flex w-full flex-col gap-4 text-sm text-white/50">
        {visible.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-3"
          >
            <span>{row.label}</span>
            <span
              className={classNames(
                "text-right text-white/80",
                row.valueClassName,
              )}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex w-full gap-6 text-sm">
      <div className="flex flex-col gap-4 text-white/50">
        {visible.map((row) => (
          <p key={row.label}>{row.label}</p>
        ))}
      </div>
      <div className="flex flex-1 flex-col items-end gap-4 text-right text-white/80">
        {visible.map((row) => (
          <div
            key={row.label}
            className={classNames(row.valueClassName)}
          >
            {row.value}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReceiptDashedRule() {
  return <hr className="w-full border-dashed border-white/10" />;
}

export function buildDefaultReceiptRows(input: {
  transactionStatusLabel: string;
  transactionStatusTone: "success" | "failed" | "neutral";
  fundStatusLabel: string;
  timeSpentLabel: string;
}): ReceiptRow[] {
  const statusClass =
    input.transactionStatusTone === "success"
      ? "text-[#39c65d]"
      : input.transactionStatusTone === "failed"
        ? "text-[#f53d6b]"
        : "text-white/80";

  return [
    {
      label: "Transaction status",
      value: input.transactionStatusLabel,
      valueClassName: statusClass,
    },
    {
      label: "Fund status",
      value: input.fundStatusLabel,
      valueClassName: "text-white/50",
    },
    {
      label: "Time spent",
      value: input.timeSpentLabel,
      valueClassName: "text-white/50",
    },
    {
      label: "Onchain receipt",
      value: null,
    },
  ];
}
