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
let cmcBudgetWarnedDayKey = "";
let cmcBackoffUntilMs = 0;

function utcDayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nextUtcMidnightMs(fromMs = Date.now()): number {
  const d = new Date(fromMs);
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
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
  cmcBudgetWarnedDayKey = "";
  cmcBackoffUntilMs = 0;
}

export function isCmcInBackoff(): boolean {
  return Date.now() < cmcBackoffUntilMs;
}

export function getCmcBackoffUntilForTests(): number {
  return cmcBackoffUntilMs;
}

export function setCmcBackoffUntil(untilMs: number, reason: string): void {
  cmcBackoffUntilMs = Math.max(cmcBackoffUntilMs, untilMs);
  console.warn(
    JSON.stringify({
      event: "market_data_cmc_backoff",
      level: "warn",
      reason,
      until: new Date(cmcBackoffUntilMs).toISOString(),
    }),
  );
}

export function applyCmcRateLimitBackoff(
  httpStatus: number,
  errorCode?: number,
): void {
  if (httpStatus === 429 && errorCode === 1008) {
    setCmcBackoffUntil(Date.now() + 60_000, "cmc_minute_limit_1008");
    return;
  }
  if (httpStatus === 429 || errorCode === 1009 || errorCode === 1010) {
    setCmcBackoffUntil(nextUtcMidnightMs(), "cmc_daily_or_monthly_limit");
    return;
  }
  if (httpStatus === 429) {
    setCmcBackoffUntil(Date.now() + 60_000, "cmc_http_429");
  }
}

function maybeWarnCmcBudgetThreshold(): void {
  const day = utcDayKey();
  if (cmcBudgetWarnedDayKey === day) return;
  const max = maxCmcCallsPerDayPerInstance();
  if (max <= 0) return;
  const threshold = Math.floor(max * 0.8);
  if (cmcCallsToday >= threshold) {
    cmcBudgetWarnedDayKey = day;
    console.warn(
      JSON.stringify({
        event: "market_data_cmc_budget_warning",
        level: "warn",
        callsToday: cmcCallsToday,
        dailyMax: max,
        pctUsed: Number(((cmcCallsToday / max) * 100).toFixed(1)),
      }),
    );
  }
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
    cmcBudgetWarnedDayKey = "";
  }
  cmcCallsToday += 1;
  maybeWarnCmcBudgetThreshold();
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
