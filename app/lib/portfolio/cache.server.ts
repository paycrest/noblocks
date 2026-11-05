import "server-only";

import type { PortfolioBuildInputHolding } from "./types";

const TTL_MS = 20_000;

export type PortfolioHoldingsCacheEntry = {
  holdings: PortfolioBuildInputHolding[];
  asOf: string;
  stale: boolean;
  expiresAt: number;
};

const cache = new Map<string, PortfolioHoldingsCacheEntry>();

export function portfolioCacheKey(evmBalanceAddress: string): string {
  return evmBalanceAddress.trim().toLowerCase();
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
