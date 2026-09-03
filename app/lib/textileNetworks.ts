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

export const TEXTILE_SUPPORTED_CHAIN_IDS = new Set<number>([56, 42220]);

/** Live Textile USDT↔cNGN token addresses per chain. */
export const TEXTILE_CORRIDOR_TOKENS: Record<
  number,
  { usdt: `0x${string}`; cngn: `0x${string}` }
> = {
  56: {
    usdt: "0x55d398326f99059ff775485246999027b3197955",
    cngn: "0xa8aea66b361a8d53e8865c62d142167af28af058",
  },
  42220: {
    usdt: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
    cngn: "0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f",
  },
};

export function isTextileCorridorPair(
  chainId: number,
  sellToken: string,
  buyToken: string,
): boolean {
  const tokens = TEXTILE_CORRIDOR_TOKENS[chainId];
  if (!tokens) return false;

  const sell = sellToken.toLowerCase();
  const buy = buyToken.toLowerCase();
  const usdt = tokens.usdt.toLowerCase();
  const cngn = tokens.cngn.toLowerCase();

  return (sell === usdt && buy === cngn) || (sell === cngn && buy === usdt);
}

export function textileChainId(networkName: string): number | null {
  const cfg =
    TEXTILE_NETWORK_CONFIG[networkName as TextileNetworkName];
  return cfg?.chainId ?? null;
}
