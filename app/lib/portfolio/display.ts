import Decimal from "decimal.js";
import type { PortfolioBucket, PortfolioSummary } from "./types";

const money = Decimal.clone({ precision: 40 });

export function formatPortfolioUsd(totalUsd: string): string {
  try {
    const value = money(totalUsd.trim());
    const rounded = value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    if (rounded.isZero()) {
      return "$0.00";
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(rounded.toNumber());
  } catch {
    return "—";
  }
}

/** Compact bucket row amount (Figma uses "$0" without cents for empty buckets). */
export function formatPortfolioBucketUsd(totalUsd: string): string {
  try {
    const value = money(totalUsd.trim());
    if (value.isZero()) {
      return "$0";
    }
    return formatPortfolioUsd(totalUsd);
  } catch {
    return "—";
  }
}

export function isZeroPortfolioUsd(totalUsd: string): boolean {
  try {
    return money(totalUsd.trim()).isZero();
  } catch {
    return true;
  }
}

export function countBucketAssets(bucket: PortfolioBucket): number {
  return bucket.holdings.filter((h) => {
    try {
      return !money(h.amount.trim()).isZero();
    } catch {
      return false;
    }
  }).length;
}

export function isPortfolioEmpty(summary: PortfolioSummary): boolean {
  if (!isZeroPortfolioUsd(summary.totalUsd)) {
    return false;
  }
  return (
    countBucketAssets(summary.buckets.tokens) === 0 &&
    countBucketAssets(summary.buckets.earn) === 0 &&
    countBucketAssets(summary.buckets.stocks) === 0
  );
}

export function bucketSubtitle(
  bucketKey: "tokens" | "earn" | "stocks",
  bucket: PortfolioBucket,
  maxEarnApyDisplay: string,
): string {
  const count = countBucketAssets(bucket);
  if (count === 0) {
    return "No assets yet";
  }
  if (bucketKey === "tokens") {
    return count === 1 ? "1 Asset" : `${count} Assets`;
  }
  if (bucketKey === "earn") {
    return `${count} Asset${count === 1 ? "" : "s"} earning up to ${maxEarnApyDisplay} pa`;
  }
  return count === 1 ? "1 company" : `${count} companies`;
}
