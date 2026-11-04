"use client";

import type { ReactNode } from "react";
import { LinkSquare02Icon } from "hugeicons-react";

import { classNames } from "@/app/utils";

import {
  drawerBodyText,
  drawerDashedDividerClasses,
  drawerFailedStatusClasses,
  drawerSecondaryText,
  drawerSuccessIconClasses,
} from "./drawerStyles";
import { getAllowlistedExplorerUrl } from "./explorer";
import type { ReceiptRow } from "./types";

export type ReceiptMetaRowsProps = {
  rows: ReceiptRow[];
  networkName: string;
  txHash?: string | null;
  explorerLinkLabel?: string;
  layout?: "drawer" | "modal" | "failed";
};

type DisplayRow = {
  label: string;
  value: ReactNode;
  valueClassName?: string;
  hidden?: boolean;
};

const valueFallbackClass = drawerSecondaryText;

export function ReceiptMetaRows({
  rows,
  networkName,
  txHash,
  explorerLinkLabel = "View in explorer",
  layout = "drawer",
}: ReceiptMetaRowsProps) {
  const explorerUrl = getAllowlistedExplorerUrl(networkName, txHash);

  const mergedRows: DisplayRow[] = [];

  for (const row of rows) {
    if (row.kind !== "explorer") {
      mergedRows.push({
        label: row.label,
        value: row.value,
        valueClassName: row.valueClassName,
      });
      continue;
    }
    if (!explorerUrl) {
      mergedRows.push({
        label: row.label,
        value: null,
        hidden: true,
      });
      continue;
    }
    mergedRows.push({
      label: row.label,
      value: (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-lavender-500 hover:underline"
        >
          {explorerLinkLabel}
          <LinkSquare02Icon className="size-4 shrink-0" aria-hidden />
          <span className="sr-only">(opens in new tab)</span>
        </a>
      ),
      valueClassName: row.valueClassName,
    });
  }

  const visible = mergedRows.filter((row) => !row.hidden);

  if (layout === "modal") {
    return (
      <div className="mx-auto flex w-[275px] max-w-full flex-col gap-[19px] text-sm">
        {visible.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-3"
          >
            <span className={drawerSecondaryText}>{row.label}</span>
            <span
              className={classNames(
                "text-right",
                row.valueClassName ?? valueFallbackClass,
              )}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (layout === "failed") {
    return (
      <dl className="mx-auto flex w-full max-w-[320px] flex-col gap-4 text-sm">
        {visible.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[max-content_minmax(0,1fr)] items-start gap-x-4"
          >
            <dt
              className={classNames(
                drawerSecondaryText,
                "whitespace-nowrap",
              )}
            >
              {row.label}
            </dt>
            <dd
              className={classNames(
                "min-w-0 text-left",
                row.valueClassName ?? valueFallbackClass,
              )}
            >
              {row.label === "Onchain receipt" ? (
                <span className="inline-flex max-w-full flex-nowrap items-center gap-1 whitespace-nowrap">
                  {row.value}
                </span>
              ) : (
                row.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <div className="mx-auto flex w-[256px] max-w-full gap-6 text-sm">
      <div className={classNames("flex flex-col gap-6", drawerSecondaryText)}>
        {visible.map((row) => (
          <p key={row.label}>{row.label}</p>
        ))}
      </div>
      <div className="flex flex-1 flex-col items-end gap-6 text-right">
        {visible.map((row) => (
          <div
            key={row.label}
            className={classNames(row.valueClassName ?? valueFallbackClass)}
          >
            {row.value}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReceiptDashedRule({ className }: { className?: string }) {
  return (
    <hr className={classNames("w-full", drawerDashedDividerClasses, className)} />
  );
}

export function buildDefaultReceiptRows(input: {
  transactionStatusLabel: string;
  transactionStatusTone: "success" | "failed" | "neutral";
  fundStatusLabel: string;
  timeSpentLabel: string;
}): ReceiptRow[] {
  const statusClass =
    input.transactionStatusTone === "success"
      ? drawerSuccessIconClasses
      : input.transactionStatusTone === "failed"
        ? drawerFailedStatusClasses
        : drawerBodyText;

  return [
    {
      kind: "default",
      label: "Transaction status",
      value: input.transactionStatusLabel,
      valueClassName: statusClass,
    },
    {
      kind: "default",
      label: "Fund status",
      value: input.fundStatusLabel,
      valueClassName: valueFallbackClass,
    },
    {
      kind: "default",
      label: "Time spent",
      value: input.timeSpentLabel,
      valueClassName: valueFallbackClass,
    },
    {
      kind: "explorer",
      label: "Onchain receipt",
    },
  ];
}
