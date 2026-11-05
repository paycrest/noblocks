import "server-only";

import { getRegistryEntry } from "./assets";
import type { HistoryRange } from "./types";
import {
  blockPriceFetchBriefly,
  getCachedChange,
  getCachedPrice,
  getCachedStats,
  getStalePrice,
  getStaleStats,
  isPriceFetchBlocked,
  setCachedChange,
  setCachedPrice,
  withSingleFlight,
} from "./cache";
import {
  chainlinkPriceProvider,
  roundToPriceString,
  roundToSource,
} from "./chainlink";
import { coinMarketCapStatsProvider } from "./coinmarketcap";
import { computeCngnBadge } from "./cngn";
import { logMarketDataInfo } from "./log";
import {
  getCachedHistoryResponse,
  getHistoryBucket,
  historyBucketKey,
  isBucketClosed,
  setCachedHistoryResponse,
  setHistoryBucket,
} from "./history-cache";
import {
  applySpikeFilter,
  bucketSpecForRange,
  bucketTimestamps,
  rangeStartUnix,
  type RawPoint,
} from "./series";
import {
  HISTORY_BACKFILL_DEADLINE_MS,
  historyDeadlineMs,
  isRangeBeforeHistoryStart,
} from "./history-resolver";
import Decimal from "decimal.js";
import { absChangeDecimal, pctChangeDecimal } from "./validate";
import type { TokenHistoryResponse, TokenMarketSnapshot, TokenStatsBlock } from "./types";

export class PriceUnavailableError extends Error {
  constructor(message = "Price data unavailable") {
    super(message);
    this.name = "PriceUnavailableError";
  }
}

const historyBackfillInFlight = new Set<string>();

function mergeHistorySamplesIntoCache(
  id: string,
  range: HistoryRange,
  entry: NonNullable<ReturnType<typeof getRegistryEntry>>,
  samples: Array<{
    t: number;
    bucketStart: number;
    answer: bigint;
    decimals: number;
  }>,
  stepSec: number,
  nowSec: number,
  merged: RawPoint[],
): void {
  for (const r of samples) {
    const p = roundToPriceString({
      answer: r.answer,
      updatedAt: r.t,
      decimals: r.decimals,
      chain: entry.price.chain,
      pairSlug: entry.price.pairSlug,
      stale: false,
      marketClosed: false,
    });
    const closed = isBucketClosed(r.bucketStart, stepSec, nowSec);
    const point = { t: r.t, p };
    setHistoryBucket(historyBucketKey(id, range, r.bucketStart), point, closed);
    if (!merged.some((m) => m.t === r.t)) merged.push(point);
  }
}

function scheduleHistoryBackfill(
  id: string,
  range: HistoryRange,
  gridNowSec: number,
): void {
  const key = `${id}:${range}`;
  if (historyBackfillInFlight.has(key)) return;
  historyBackfillInFlight.add(key);

  void (async () => {
    try {
      const entry = getRegistryEntry(id);
      if (!entry) return;
      const inception = entry.price.inceptionUnix;
      const spec = bucketSpecForRange(range);
      const timestamps = bucketTimestamps(range, gridNowSec, inception);
      const from = rangeStartUnix(range, gridNowSec, inception);
      const nowSec = Math.floor(Date.now() / 1000);
      const merged: RawPoint[] = [];

      for (const t of timestamps) {
        const closed = isBucketClosed(t, spec.stepSec, nowSec);
        const cached = getHistoryBucket(
          historyBucketKey(id, range, t),
          closed,
        );
        if (cached) merged.push(cached);
      }

      const toFetch = timestamps.filter((t) => {
        const closed = isBucketClosed(t, spec.stepSec, nowSec);
        return !getHistoryBucket(historyBucketKey(id, range, t), closed);
      });
      if (toFetch.length === 0) return;

      const prior = getCachedHistoryResponse(id, range);
      const priorCount = prior?.points.length ?? 0;
      const mergedBefore = merged.length;

      logMarketDataInfo("history_backfill_start", {
        id,
        range,
        missing: toFetch.length,
      });

      const { samples, partial, historyStartSec } =
        await chainlinkPriceProvider.readHistoryAtTimestamps(entry, toFetch, {
          deadlineMs: HISTORY_BACKFILL_DEADLINE_MS,
          stepSec: spec.stepSec,
          rangeFromSec: from,
          nowSec: gridNowSec,
          specCount: spec.count,
          range,
        });

      mergeHistorySamplesIntoCache(
        id,
        range,
        entry,
        samples,
        spec.stepSec,
        nowSec,
        merged,
      );

      merged.sort((a, b) => a.t - b.t);
      const stableOrNgn =
        entry.id === "cngn" ||
        entry.id === "usdc" ||
        entry.id === "usdt" ||
        entry.id === "cusd";
      const filtered = applySpikeFilter(merged, {
        stableOrNgn,
        stepSec: spec.stepSec,
      });
      if (filtered.length === 0) return;

      let responsePartial = partial;
      if (
        historyStartSec !== undefined &&
        isRangeBeforeHistoryStart(from, historyStartSec, spec.stepSec)
      ) {
        responsePartial = true;
      }

      const filled = Math.max(0, filtered.length - priorCount);
      logMarketDataInfo("history_backfill_done", {
        id,
        range,
        filled,
        partial: responsePartial,
        points: filtered.length,
      });

      if (filtered.length <= priorCount && responsePartial) return;

      const response: TokenHistoryResponse = {
        id,
        range,
        points: filtered.map((p) => [p.t, p.p]),
        from,
        asOf: new Date().toISOString(),
        stale: false,
        partial: responsePartial,
        ...(historyStartSec !== undefined
          ? { historyStart: historyStartSec }
          : {}),
      };
      setCachedHistoryResponse(id, range, response);
      void mergedBefore;
    } finally {
      historyBackfillInFlight.delete(key);
    }
  })();
}

interface PricePayload {
  price: string;
  source: string;
  asOf: string;
  derived: boolean;
  stale: boolean;
  marketClosed: boolean;
}

async function loadLatestPrice(id: string): Promise<PricePayload> {
  const cacheKey = `price:${id}`;
  if (isPriceFetchBlocked(id)) {
    throw new PriceUnavailableError();
  }
  const cached = getCachedPrice<PricePayload>(cacheKey);
  if (cached) return cached;

  const entry = getRegistryEntry(id);
  if (!entry) throw new PriceUnavailableError();

  const result = await withSingleFlight(`fetch:${cacheKey}`, async () => {
    if (isPriceFetchBlocked(id)) return null;
    const hit = getCachedPrice<PricePayload>(cacheKey);
    if (hit) return hit;

    const latest = await chainlinkPriceProvider.readLatest(entry);
    if (latest) {
      const payload: PricePayload = {
        price: roundToPriceString(latest.round),
        source: roundToSource(latest.round),
        asOf: new Date(latest.round.updatedAt * 1000).toISOString(),
        derived: latest.derived,
        stale: latest.round.stale,
        marketClosed: latest.round.marketClosed,
      };
      setCachedPrice(cacheKey, payload);
      return payload;
    }

    const stale = getStalePrice<PricePayload>(cacheKey);
    if (stale) return { ...stale, stale: true };

    blockPriceFetchBriefly(id);
    return null;
  });

  if (!result) throw new PriceUnavailableError();
  return result;
}

async function load24hChange(
  id: string,
  currentPrice: string,
): Promise<{ pct: string; abs: string } | null> {
  const cacheKey = `change:${id}`;
  const cached = getCachedChange<{ pct: string; abs: string }>(cacheKey);
  if (cached) return cached;

  const entry = getRegistryEntry(id);
  if (!entry) return null;

  return withSingleFlight(cacheKey, async () => {
    const now = Math.floor(Date.now() / 1000);
    const past = await chainlinkPriceProvider.readAt(entry, now - 86400);
    if (!past) return null;
    const pastPrice = roundToPriceString(past);
    const change = {
      pct: pctChangeDecimal(currentPrice, pastPrice),
      abs: absChangeDecimal(currentPrice, pastPrice),
    };
    setCachedChange(cacheKey, change);
    return change;
  });
}

async function ensureStatsLoaded(): Promise<void> {
  await withSingleFlight("stats:batch", async () => {
    const anyFresh = getCachedStats("usdc");
    if (anyFresh) return;
    await coinMarketCapStatsProvider.fetchAllStats();
  });
}

async function loadStats(id: string): Promise<TokenStatsBlock | null> {
  let stats = getCachedStats(id);
  if (stats) return stats;

  await ensureStatsLoaded();
  stats = getCachedStats(id);
  if (stats) return stats;

  return getStaleStats(id);
}

function cmcImpliedPrice(stats: TokenStatsBlock): string | null {
  if (!stats.marketCap || !stats.totalSupply) return null;
  try {
    return new Decimal(stats.marketCap).div(stats.totalSupply).toFixed();
  } catch {
    return null;
  }
}

export async function getTokenMarketSnapshot(
  id: string,
): Promise<TokenMarketSnapshot> {
  const priceBlock = await loadLatestPrice(id);
  const change24h = await load24hChange(id, priceBlock.price);
  let stats = await loadStats(id);

  if (id === "cngn" && stats?.marketCapMode === "totalSupply" && stats.totalSupply) {
    stats = { ...stats, circulatingSupply: stats.totalSupply };
  }

  const snapshot: TokenMarketSnapshot = {
    id,
    price: priceBlock.price,
    change24h,
    asOf: priceBlock.asOf,
    source: priceBlock.source,
    derived: priceBlock.derived,
    stale: priceBlock.stale,
    marketClosed: priceBlock.marketClosed,
    stats,
  };

  if (id === "cngn" && stats) {
    const marketPrice = cmcImpliedPrice(stats);
    const badge = computeCngnBadge({
      referencePrice: priceBlock.price,
      cmcMarketPrice: marketPrice,
      referenceFresh: !priceBlock.stale,
      cmcFresh: !stats.stale,
    });
    if (badge) snapshot.cngn = badge;
  }

  return snapshot;
}

export async function getTokenHistory(
  id: string,
  range: HistoryRange,
): Promise<TokenHistoryResponse> {
  const entry = getRegistryEntry(id);
  if (!entry) throw new PriceUnavailableError();

  const cachedResponse = getCachedHistoryResponse(id, range);
  if (cachedResponse) return cachedResponse;

  const nowSec = Math.floor(Date.now() / 1000);
  const inception = entry.price.inceptionUnix;
  const spec = bucketSpecForRange(range);
  const timestamps = bucketTimestamps(range, nowSec, inception);
  const from = rangeStartUnix(range, nowSec, inception);
  const flightKey = `history:${id}:${range}`;

  return withSingleFlight(flightKey, async () => {
    const hit = getCachedHistoryResponse(id, range);
    if (hit) return hit;

    const merged: RawPoint[] = [];
    const toFetch: number[] = [];

    for (const t of timestamps) {
      const closed = isBucketClosed(t, spec.stepSec, nowSec);
      const key = historyBucketKey(id, range, t);
      const cached = getHistoryBucket(key, closed);
      if (cached) {
        merged.push(cached);
        continue;
      }
      toFetch.push(t);
    }

    let partial = false;
    let historyStartSec: number | undefined;

    if (toFetch.length > 0) {
      const {
        samples,
        partial: upstreamPartial,
        historyStartSec: upstreamHistoryStart,
      } = await chainlinkPriceProvider.readHistoryAtTimestamps(entry, toFetch, {
        deadlineMs: historyDeadlineMs(spec.stepSec, spec.count, range),
        stepSec: spec.stepSec,
        rangeFromSec: from,
        nowSec,
        specCount: spec.count,
        range,
      });
      partial = upstreamPartial;
      historyStartSec = upstreamHistoryStart;

      mergeHistorySamplesIntoCache(
        id,
        range,
        entry,
        samples,
        spec.stepSec,
        nowSec,
        merged,
      );
    }

    merged.sort((a, b) => a.t - b.t);

    const stableOrNgn =
      entry.id === "cngn" ||
      entry.id === "usdc" ||
      entry.id === "usdt" ||
      entry.id === "cusd";
    const filtered = applySpikeFilter(merged, {
      stableOrNgn,
      stepSec: spec.stepSec,
    });

    if (filtered.length === 0) {
      const empty: TokenHistoryResponse = {
        id,
        range,
        points: [],
        from,
        asOf: new Date().toISOString(),
        stale: false,
        partial: true,
        unavailable: true,
      };
      setCachedHistoryResponse(id, range, empty);
      return empty;
    }

    if (
      historyStartSec !== undefined &&
      isRangeBeforeHistoryStart(from, historyStartSec, spec.stepSec)
    ) {
      partial = true;
    }

    const response: TokenHistoryResponse = {
      id,
      range,
      points: filtered.map((p) => [p.t, p.p]),
      from,
      asOf: new Date().toISOString(),
      stale: false,
      partial,
      ...(historyStartSec !== undefined ? { historyStart: historyStartSec } : {}),
    };

    setCachedHistoryResponse(id, range, response);
    if (partial && toFetch.length > 0) {
      scheduleHistoryBackfill(id, range, nowSec);
    }
    return response;
  });
}
