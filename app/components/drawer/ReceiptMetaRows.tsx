"use client";

import { Fragment, type ReactNode } from "react";
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

  const receiptGrid = (className: string, valueClassName: string) => (
    <dl
      className={classNames(
        "mx-auto grid w-full max-w-[320px] grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-4 text-sm",
        className,
      )}
    >
      {visible.map((row) => (
        <Fragment key={row.label}>
          <dt className={classNames(drawerSecondaryText, "whitespace-nowrap")}>
            {row.label}
          </dt>
          <dd
            className={classNames(
              "min-w-0 justify-self-end text-right",
              row.valueClassName ?? valueClassName,
            )}
          >
            {row.label === "Onchain receipt" ? (
              <span className="inline-flex max-w-full flex-nowrap items-center justify-end gap-1 whitespace-nowrap">
                {row.value}
              </span>
            ) : (
              row.value
            )}
          </dd>
        </Fragment>
      ))}
    </dl>
  );

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
    return receiptGrid("", valueFallbackClass);
  }

  return receiptGrid("max-w-[256px]", valueFallbackClass);
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
