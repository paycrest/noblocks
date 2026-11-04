import "server-only";

import { LRUCache } from "lru-cache";
import {
  getMarketCmcMonthlyBudget,
  getMarketDataReplicas,
} from "@/app/lib/server-config";
import type { TokenStatsBlock } from "./types";

const PRICE_TTL_MS = 60_000;
const CHANGE_TTL_MS = 5 * 60_000;
const STATS_TTL_MS = 10 * 60_000;
const STALE_MAX_MS = 7 * 24 * 60 * 60_000;
const NEGATIVE_TTL_MS = 30_000;

export interface CachedValue<T> {
  value: T;
  fetchedAt: number;
}

type InFlightMap = Map<string, Promise<unknown>>;

const priceCache = new LRUCache<string, CachedValue<unknown>>({ max: 32 });
const changeCache = new LRUCache<string, CachedValue<unknown>>({ max: 32 });
const statsCache = new LRUCache<string, CachedValue<TokenStatsBlock>>({
  max: 8,
});
const staleStatsStore = new LRUCache<string, CachedValue<TokenStatsBlock>>({
  max: 16,
});
const priceStaleStore = new LRUCache<string, CachedValue<unknown>>({
  max: 32,
});
const negativeCache = new LRUCache<string, number>({ max: 64 });
const inFlight: InFlightMap = new Map();

let cmcCallsToday = 0;
let cmcBudgetDayKey = "";

function utcDayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function resetMarketDataCachesForTests(): void {
  priceCache.clear();
  changeCache.clear();
  statsCache.clear();
  staleStatsStore.clear();
  priceStaleStore.clear();
  negativeCache.clear();
  inFlight.clear();
  cmcCallsToday = 0;
  cmcBudgetDayKey = utcDayKey();
}

export function maxCmcCallsPerDayPerInstance(): number {
  const budget = getMarketCmcMonthlyBudget();
  const replicas = Math.max(1, getMarketDataReplicas());
  return Math.floor(budget / 30 / replicas);
}

export function canSpendCmcCredit(): boolean {
  const day = utcDayKey();
  if (day !== cmcBudgetDayKey) {
    cmcBudgetDayKey = day;
    cmcCallsToday = 0;
  }
  return cmcCallsToday < maxCmcCallsPerDayPerInstance();
}

export function recordCmcCall(): void {
  const day = utcDayKey();
  if (day !== cmcBudgetDayKey) {
    cmcBudgetDayKey = day;
    cmcCallsToday = 0;
  }
  cmcCallsToday += 1;
}

export function getCmcCallsTodayForTests(): number {
  return cmcCallsToday;
}

function isFresh(entry: CachedValue<unknown> | undefined, ttlMs: number): boolean {
  if (!entry) return false;
  return Date.now() - entry.fetchedAt < ttlMs;
}

function isStaleCopyValid(entry: CachedValue<unknown> | undefined): boolean {
  if (!entry) return false;
  return Date.now() - entry.fetchedAt < STALE_MAX_MS;
}

export async function withSingleFlight<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const p = fn().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, p);
  return p;
}

export function getCachedPrice<T>(key: string): T | null {
  const hit = priceCache.get(key) as CachedValue<T> | undefined;
  if (isFresh(hit, PRICE_TTL_MS)) return hit!.value;
  return null;
}

export function setCachedPrice<T>(key: string, value: T): void {
  const entry = { value, fetchedAt: Date.now() };
  priceCache.set(key, entry);
  priceStaleStore.set(key, entry);
}

export function getStalePrice<T>(key: string): T | null {
  const hit = priceStaleStore.get(key) as CachedValue<T> | undefined;
  if (isStaleCopyValid(hit)) return hit!.value;
  return null;
}

export function getCachedChange<T>(key: string): T | null {
  const hit = changeCache.get(key) as CachedValue<T> | undefined;
  if (isFresh(hit, CHANGE_TTL_MS)) return hit!.value;
  return null;
}

export function setCachedChange<T>(key: string, value: T): void {
  changeCache.set(key, { value, fetchedAt: Date.now() });
}

export function getCachedStats(key: string): TokenStatsBlock | null {
  const hit = statsCache.get(key);
  if (hit && isFresh(hit, STATS_TTL_MS)) return hit.value;
  return null;
}

export function setCachedStats(key: string, value: TokenStatsBlock): void {
  const entry = { value, fetchedAt: Date.now() };
  statsCache.set(key, entry);
  staleStatsStore.set(key, entry);
}

export function getStaleStats(key: string): TokenStatsBlock | null {
  const hit = staleStatsStore.get(key);
  if (hit && isStaleCopyValid(hit)) {
    return { ...hit.value, stale: true };
  }
  return null;
}

export function isNegativeCached(key: string): boolean {
  const until = negativeCache.get(key);
  if (!until) return false;
  if (Date.now() > until) {
    negativeCache.delete(key);
    return false;
  }
  return true;
}

export function setNegativeCache(key: string): void {
  negativeCache.set(key, Date.now() + NEGATIVE_TTL_MS);
}

export const CACHE_TTLS = {
  priceMs: PRICE_TTL_MS,
  statsMs: STATS_TTL_MS,
  changeMs: CHANGE_TTL_MS,
};
