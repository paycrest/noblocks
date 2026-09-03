import config from "./config";
import type { BridgeLeg } from "./bridge";
import { TEXTILE_SUPPORTED_NETWORKS } from "./textileNetworks";
import { HYPERFX_SUPPORTED_NETWORKS } from "./hyperfxNetworks";

export { HYPERFX_SUPPORTED_NETWORKS };

export function isBridgeUiVisible(): boolean {
  return config.bridgeEnabled;
}

export function isTextileSwapEnabled(): boolean {
  return config.bridgeEnabled && config.textileEnabled;
}

export function isHyperfxSwapEnabled(): boolean {
  return config.bridgeEnabled && config.hyperfxEnabled;
}

/**
 * Same-chain USDT ↔ cNGN on BSC or Celo when Textile is enabled.
 */
export function isTextileRoute(from: BridgeLeg, to: BridgeLeg): boolean {
  if (!isTextileSwapEnabled()) return false;
  if (from.network !== to.network) return false;
  if (!TEXTILE_SUPPORTED_NETWORKS.has(from.network)) return false;

  const fromSym = from.token.toLowerCase();
  const toSym = to.token.toLowerCase();
  return (
    (fromSym === "usdt" && toSym === "cngn") ||
    (fromSym === "cngn" && toSym === "usdt")
  );
}
