import config from "./config";

export function isBridgeUiVisible(): boolean {
  return config.bridgeEnabled;
}

/** Networks where HyperFX USDC/USDT↔cNGN same-chain routing is enabled. */
export const HYPERFX_SUPPORTED_NETWORKS = new Set(["Base"]);

export function isHyperfxSwapEnabled(): boolean {
  return config.bridgeEnabled && config.hyperfxEnabled;
}
