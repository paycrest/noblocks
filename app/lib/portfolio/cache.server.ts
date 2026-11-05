import "server-only";

import { LRUCache } from "lru-cache";
import type { PortfolioBuildInputHolding } from "./types";

const TTL_MS = 20_000;

export type PortfolioHoldingsCacheEntry = {
  holdings: PortfolioBuildInputHolding[];
  asOf: string;
  stale: boolean;
  expiresAt: number;
};

export type PortfolioCacheKeyInput = {
  evmBalanceAddress: string;
  starknetAddress: string | null;
  tronAddress: string | null;
};

const cache = new LRUCache<string, PortfolioHoldingsCacheEntry>({ max: 5000 });

/** Stable cache identity: EVM + linked Starknet/Tron wallets for this session. */
export function portfolioCacheKey(input: PortfolioCacheKeyInput): string {
  const evm = input.evmBalanceAddress.trim().toLowerCase();
  const starknet = input.starknetAddress?.trim().toLowerCase() ?? "";
  const tron = input.tronAddress?.trim() ?? "";
  return `evm:${evm}|stk:${starknet}|trx:${tron}`;
}

export function getCachedPortfolioHoldings(
  key: string,
): PortfolioHoldingsCacheEntry | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) return null;
  return entry;
}

export function getStalePortfolioHoldings(
  key: string,
): PortfolioHoldingsCacheEntry | null {
  return cache.get(key) ?? null;
}

export function setCachedPortfolioHoldings(
  key: string,
  entry: Omit<PortfolioHoldingsCacheEntry, "expiresAt">,
): void {
  cache.set(key, { ...entry, expiresAt: Date.now() + TTL_MS });
}

/** @internal tests */
export function clearPortfolioHoldingsCache(): void {
  cache.clear();
}

/** @internal tests — force TTL expiry without waiting. */
export function expirePortfolioHoldingsCache(key: string): void {
  const entry = cache.get(key);
  if (entry) {
    entry.expiresAt = Date.now() - 1;
    cache.set(key, entry);
  }
}
