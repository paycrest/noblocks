import type { FeatureFlags } from "@/app/lib/flags";
import type { PortfolioBucket } from "./types";
import { countBucketAssets, isZeroPortfolioUsd } from "./display";

export function bucketHasHoldings(bucket: PortfolioBucket): boolean {
  return countBucketAssets(bucket) > 0 || !isZeroPortfolioUsd(bucket.totalUsd);
}

export function shouldShowStocksExploreCard(flags: FeatureFlags): boolean {
  return flags.stocks;
}

export function shouldShowStocksBucketRow(
  flags: FeatureFlags,
  bucket: PortfolioBucket,
): boolean {
  if (flags.stocks) return true;
  return bucketHasHoldings(bucket);
}

export function shouldShowEarnExploreCard(flags: FeatureFlags): boolean {
  return flags["noblocks-earn-v2"];
}

/** Earn positions row is always shown on Home (read-only when earn v2 is off). */
export function shouldShowEarnBucketRow(): boolean {
  return true;
}

export function isStocksBucketReadOnly(flags: FeatureFlags): boolean {
  return !flags.stocks;
}

export function isEarnBucketReadOnly(flags: FeatureFlags): boolean {
  return !flags["noblocks-earn-v2"];
}

export type WalletHomeActionId =
  | "buy"
  | "sell"
  | "receive"
  | "transfer"
  | "swap";

export function isWalletHomeActionVisible(
  action: WalletHomeActionId,
  flags: FeatureFlags,
): boolean {
  if (action === "swap") {
    return flags["noblocks-swap"];
  }
  return true;
}
