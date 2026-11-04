import "server-only";

import { FALLBACK_TOKENS } from "@/app/utils";
import { canonicalTokenSymbol } from "@/app/lib/token-symbol";
import type { AssetRegistryEntry, HistoryRange, MarketChain } from "./types";

/** L2 sequencer uptime feeds (AggregatorV3). */
export const SEQUENCER_FEEDS: Record<"base" | "arbitrum", `0x${string}`> = {
  base: "0xBCF85224fc0756B9Fa45aA7892530B47e10b6433",
  arbitrum: "0xFdB631F5EE196F0ed6FAa767959853A9F217697D",
};

export const MULTICALL3_ADDRESS =
  "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

/**
 * Feed proxies verified against Chainlink reference-data-directory (2026-11-04).
 * Base ETH/USD uses eth-usd-shared-svr-2 (legacy 0x71041… is omitted from the directory).
 */
export const ASSET_REGISTRY: Record<string, AssetRegistryEntry> = {
  usdc: {
    id: "usdc",
    symbol: "USDC",
    name: "USD Coin",
    cmcId: 3408,
    price: {
      chain: "base",
      proxy: "0x7e860098F58bBFC8648a4311b374B1D669a2bc6B",
      pairSlug: "usdc-usd",
      heartbeatS: 86400,
      description: "USDC / USD",
      decimals: 8,
      stableBand: ["0.90", "1.10"],
      inceptionUnix: 1691020800,
    },
    fallback: {
      chain: "arbitrum",
      proxy: "0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3",
      pairSlug: "usdc-usd",
      heartbeatS: 255,
      description: "USDC / USD",
      decimals: 8,
      stableBand: ["0.90", "1.10"],
    },
  },
  usdt: {
    id: "usdt",
    symbol: "USDT",
    name: "Tether USD",
    cmcId: 825,
    price: {
      chain: "base",
      proxy: "0xf19d560eB8d2ADf07BD6D13ed03e1D11215721F9",
      pairSlug: "usdt-usd",
      heartbeatS: 86400,
      description: "USDT / USD",
      decimals: 8,
      stableBand: ["0.90", "1.10"],
    },
    fallback: {
      chain: "arbitrum",
      proxy: "0x3f3f5dF88dC9F13eac63DF89EC16ef6e7E25DdE7",
      pairSlug: "usdt-usd",
      heartbeatS: 255,
      description: "USDT / USD",
      decimals: 8,
      stableBand: ["0.90", "1.10"],
    },
  },
  eth: {
    id: "eth",
    symbol: "ETH",
    name: "Ethereum",
    cmcId: 1027,
    price: {
      chain: "base",
      proxy: "0x50015f8b17fb2C290Dde41fDc246ed0dcEE93a8b",
      pairSlug: "eth-usd",
      heartbeatS: 1200,
      description: "ETH / USD",
      decimals: 8,
      inceptionUnix: 1691020800,
    },
    fallback: {
      chain: "arbitrum",
      proxy: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612",
      pairSlug: "eth-usd",
      heartbeatS: 1755,
      description: "ETH / USD",
      decimals: 8,
    },
  },
  cusd: {
    id: "cusd",
    symbol: "CUSD",
    name: "Celo Dollar",
    cmcId: 7236,
    price: {
      chain: "celo",
      proxy: "0xe38A27BE4E7d866327e09736F3C570F256FFd048",
      pairSlug: "cusd-usd",
      heartbeatS: 240,
      description: "CUSD / USD",
      decimals: 8,
      stableBand: ["0.90", "1.10"],
      inceptionUnix: 1707955200,
    },
  },
  cngn: {
    id: "cngn",
    symbol: "CNGN",
    name: "Compliant Naira",
    cmcId: 29207,
    marketCapMode: "totalSupply",
    price: {
      chain: "base",
      proxy: "0xdfbb5Cbc88E382de007bfe6CE99C388176ED80aD",
      pairSlug: "ngn-usd",
      heartbeatS: 3600,
      description: "NGN / USD",
      decimals: 8,
      forexNgn: true,
      inceptionUnix: 1743552000,
    },
    fallback: {
      chain: "celo",
      proxy: "0xc17cBE2dB40e53F4984C46F608DA6DA1fF074c11",
      pairSlug: "ngn-usd",
      heartbeatS: 240,
      description: "NGN / USD",
      decimals: 8,
      forexNgn: true,
    },
  },
};

const ID_PATTERN = /^[a-z0-9]{2,10}$/;

export function isValidMarketTokenId(raw: string): boolean {
  if (!ID_PATTERN.test(raw)) return false;
  return raw in ASSET_REGISTRY;
}

export function getRegistryEntry(id: string): AssetRegistryEntry | null {
  if (!isValidMarketTokenId(id)) return null;
  return ASSET_REGISTRY[id] ?? null;
}

export function allRegistryEntries(): AssetRegistryEntry[] {
  return Object.values(ASSET_REGISTRY);
}

export function allCmcIds(): number[] {
  return allRegistryEntries().map((e) => e.cmcId);
}

/** Maps FALLBACK_TOKENS symbols → registry id (lowercase canonical). */
export function expectedRegistryIdsFromFallbackTokens(): string[] {
  const symbols = new Set<string>();
  for (const networkTokens of Object.values(FALLBACK_TOKENS)) {
    for (const token of networkTokens) {
      const canonical = canonicalTokenSymbol(token.symbol);
      if (canonical) symbols.add(canonical.toLowerCase());
    }
  }
  return [...symbols].sort();
}

export const HISTORY_RANGES: HistoryRange[] = ["1D", "1W", "1M", "1Y", "ALL"];

export function parseHistoryRange(raw: string | null): HistoryRange | null {
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (upper === "ALL") return "ALL";
  if (HISTORY_RANGES.includes(upper as HistoryRange)) {
    return upper as HistoryRange;
  }
  return null;
}

export function chainDisplayName(chain: MarketChain): string {
  return chain;
}

export function formatPriceSource(
  chain: MarketChain,
  pairSlug: string,
): string {
  return `chainlink:${chain}:${pairSlug}`;
}
