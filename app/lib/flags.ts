/**
 * Per-feature flags for Noblocks v2 (default OFF). Each reader uses a dedicated
 * NEXT_PUBLIC_FF_* variable so Next.js can inline values into client bundles.
 */

export type FeatureFlagName =
  | "stocks"
  | "noblocks-earn-v2"
  | "noblocks-swap"
  | "noblocks-marketplace"
  | "noblocks-kyb"
  | "noblocks-tx-protection";

export type FeatureFlags = Record<FeatureFlagName, boolean>;

function readStocksFlag(): boolean {
  return process.env.NEXT_PUBLIC_FF_STOCKS === "true";
}

function readNoblocksEarnV2Flag(): boolean {
  return process.env.NEXT_PUBLIC_FF_NOBLOCKS_EARN_V2 === "true";
}

function readNoblocksSwapFlag(): boolean {
  return process.env.NEXT_PUBLIC_FF_NOBLOCKS_SWAP === "true";
}

function readNoblocksMarketplaceFlag(): boolean {
  return process.env.NEXT_PUBLIC_FF_NOBLOCKS_MARKETPLACE === "true";
}

function readNoblocksKybFlag(): boolean {
  return process.env.NEXT_PUBLIC_FF_NOBLOCKS_KYB === "true";
}

function readNoblocksTxProtectionFlag(): boolean {
  return process.env.NEXT_PUBLIC_FF_NOBLOCKS_TX_PROTECTION === "true";
}

const FLAG_READERS: Record<FeatureFlagName, () => boolean> = {
  stocks: readStocksFlag,
  "noblocks-earn-v2": readNoblocksEarnV2Flag,
  "noblocks-swap": readNoblocksSwapFlag,
  "noblocks-marketplace": readNoblocksMarketplaceFlag,
  "noblocks-kyb": readNoblocksKybFlag,
  "noblocks-tx-protection": readNoblocksTxProtectionFlag,
};

/** Snapshot of all v2 feature flags. */
export function getFeatureFlags(): FeatureFlags {
  return {
    stocks: readStocksFlag(),
    "noblocks-earn-v2": readNoblocksEarnV2Flag(),
    "noblocks-swap": readNoblocksSwapFlag(),
    "noblocks-marketplace": readNoblocksMarketplaceFlag(),
    "noblocks-kyb": readNoblocksKybFlag(),
    "noblocks-tx-protection": readNoblocksTxProtectionFlag(),
  };
}

export function isFeatureEnabled(flag: FeatureFlagName): boolean {
  return FLAG_READERS[flag]();
}
