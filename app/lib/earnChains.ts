/** EVM chains supported for Phase 2 Earn (USDC → LayerSwap → Starknet Vesu). */
export const EVM_EARN_SOURCE_CHAINS = [
  "Base",
  "BNB Smart Chain",
  "Arbitrum One",
  "Polygon",
  "Celo",
  "Scroll",
  "Ethereum",
] as const;

export type EvmEarnSourceChain = (typeof EVM_EARN_SOURCE_CHAINS)[number];

/** Excluded from Phase 2 — LayerSwap does not bridge USDC from Lisk. */
export const EVM_EARN_EXCLUDED_CHAINS = ["Lisk"] as const;

/**
 * Noblocks network display name → LayerSwap network identifier.
 * LayerSwap also accepts numeric chain IDs; these names match their API docs.
 */
export const LAYERSWAP_SOURCE_NETWORK: Record<EvmEarnSourceChain, string> = {
  Base: "BASE_MAINNET",
  "BNB Smart Chain": "BSC_MAINNET",
  "Arbitrum One": "ARBITRUM_MAINNET",
  Polygon: "POLYGON_MAINNET",
  Celo: "CELO_MAINNET",
  Scroll: "SCROLL_MAINNET",
  Ethereum: "ETHEREUM_MAINNET",
};

export const LAYERSWAP_STARKNET_NETWORK = "STARKNET_MAINNET";

export const EARN_USDC_SYMBOL = "USDC";

/** Deposit confirmation copy template; ETA filled from LayerSwap quote when available. */
export function earnBridgeConfirmationCopy(etaLabel?: string): string {
  const eta = etaLabel?.trim() || "~15 min";
  return `Your USDC will be bridged to Vesu on Starknet · ${eta} · gasless.`;
}

/** Withdraw confirmation for EVM-sourced earn positions. */
export function earnBridgeWithdrawCopy(etaLabel?: string, chainName?: string): string {
  const eta = etaLabel?.trim() || "~15 min";
  const dest = chainName?.trim() || "your source chain";
  return `USDC will leave Vesu and bridge back to ${dest} · ${eta} · gasless.`;
}

export const EARN_STARKNET_DISCLOSURE =
  "lives on Vesu pool, Starknet";

export function isEvmEarnSourceChain(
  chainName: string,
): chainName is EvmEarnSourceChain {
  return (EVM_EARN_SOURCE_CHAINS as readonly string[]).includes(chainName);
}

export function layerswapSourceNetwork(
  chainName: string,
): string | undefined {
  if (!isEvmEarnSourceChain(chainName)) return undefined;
  return LAYERSWAP_SOURCE_NETWORK[chainName];
}
