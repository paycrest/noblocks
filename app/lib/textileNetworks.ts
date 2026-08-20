/**
 * Textile FX network config: same-chain USDT ↔ cNGN on BSC and Celo.
 * @see https://docs.textilecredit.com/address-book.html
 */

export const TEXTILE_NETWORK_CONFIG = {
  "BNB Smart Chain": { chainId: 56 },
  Celo: { chainId: 42220 },
} as const;

export type TextileNetworkName = keyof typeof TEXTILE_NETWORK_CONFIG;

export const TEXTILE_SUPPORTED_NETWORKS = new Set<string>(
  Object.keys(TEXTILE_NETWORK_CONFIG),
);

export function textileChainId(networkName: string): number | null {
  const cfg =
    TEXTILE_NETWORK_CONFIG[networkName as TextileNetworkName];
  return cfg?.chainId ?? null;
}
