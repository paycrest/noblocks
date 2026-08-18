/**
 * HyperFX network config: Noblocks chains with cNGN that IntentGateway supports.
 * Lisk has cNGN in Noblocks but is not on Hyperbridge — stays on LI.FI.
 */

import { base, bsc, mainnet, polygon, type Chain } from "viem/chains";

const INTENT_GATEWAY_PROXY =
  "0xAe041F7B0CB581876832830baeB6a2Aa2a3C9716" as const;

export const HYPERFX_NETWORK_CONFIG = {
  Base: {
    chainId: 8453,
    chain: base,
    gateway: INTENT_GATEWAY_PROXY,
    alchemyHost: "base-mainnet",
  },
  Polygon: {
    chainId: 137,
    chain: polygon,
    gateway: INTENT_GATEWAY_PROXY,
    alchemyHost: "polygon-mainnet",
  },
  "BNB Smart Chain": {
    chainId: 56,
    chain: bsc,
    gateway: INTENT_GATEWAY_PROXY,
    alchemyHost: "bnb-mainnet",
  },
  Ethereum: {
    chainId: 1,
    chain: mainnet,
    gateway: INTENT_GATEWAY_PROXY,
    alchemyHost: "eth-mainnet",
  },
} satisfies Record<
  string,
  {
    chainId: number;
    chain: Chain;
    gateway: typeof INTENT_GATEWAY_PROXY;
    alchemyHost: string;
  }
>;

export type HyperfxNetwork = keyof typeof HYPERFX_NETWORK_CONFIG;

export const HYPERFX_SUPPORTED_NETWORKS = new Set<string>(
  Object.keys(HYPERFX_NETWORK_CONFIG),
);

export function isHyperfxSupportedNetwork(
  network: string,
): network is HyperfxNetwork {
  return network in HYPERFX_NETWORK_CONFIG;
}

export function getHyperfxNetworkConfig(network: string) {
  if (!isHyperfxSupportedNetwork(network)) return undefined;
  return HYPERFX_NETWORK_CONFIG[network];
}

export const HYPERFX_GATEWAY_BY_NETWORK: Record<string, `0x${string}`> =
  Object.fromEntries(
    Object.entries(HYPERFX_NETWORK_CONFIG).map(([name, cfg]) => [
      name,
      cfg.gateway,
    ]),
  ) as Record<string, `0x${string}`>;

export const HYPERFX_VIEM_CHAIN_BY_NETWORK: Record<string, Chain> =
  Object.fromEntries(
    Object.entries(HYPERFX_NETWORK_CONFIG).map(([name, cfg]) => [
      name,
      cfg.chain,
    ]),
  );

export const HYPERFX_CHAIN_ID_BY_NETWORK: Record<string, number> =
  Object.fromEntries(
    Object.entries(HYPERFX_NETWORK_CONFIG).map(([name, cfg]) => [
      name,
      cfg.chainId,
    ]),
  );
