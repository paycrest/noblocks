/**
 * Real-RPC smoke check for Chainlink history resolution.
 *
 * Usage (from repo root):
 *   MARKET_DATA_RPC_KEY=… pnpm verify:market-history
 */

import Decimal from "decimal.js";
import type { HistoryRange, TokenHistoryResponse } from "../app/lib/market-data/types";
import {
  bucketSpecForRange,
  bucketTimestamps,
} from "../app/lib/market-data/series";
import { acceptanceSlopSec } from "../app/lib/market-data/history-resolver";
import { redactErrorMessage } from "../app/lib/market-data/validate";

const RANGES: HistoryRange[] = ["1D", "1W", "1M", "1Y", "ALL"];
const CHECK_TOKENS = ["eth", "usdc", "cngn"] as const;
const FLAT_CHECK_RANGES: HistoryRange[] = ["1Y", "ALL"];

function longestIdenticalRunBuckets(
  points: Array<[number, string]>,
): { buckets: number; price: string } {
  if (points.length === 0) return { buckets: 0, price: "" };
  let best = { buckets: 1, price: points[0][1] };
  let run = 1;
  for (let i = 1; i < points.length; i++) {
    if (points[i][1] === points[i - 1][1]) {
      run += 1;
      if (run > best.buckets) best = { buckets: run, price: points[i][1] };
    } else {
      run = 1;
    }
  }
  return best;
}

function maxAdjacentStepPct(points: Array<[number, string]>): number {
  let max = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = new Decimal(points[i - 1][1]);
    const cur = new Decimal(points[i][1]);
    if (prev.lte(0)) continue;
    const pct = cur.minus(prev).div(prev).abs().mul(100).toNumber();
    if (pct > max) max = pct;
  }
  return max;
}

function expectedPointCount(
  range: HistoryRange,
  nowSec: number,
  historyStartSec: number | undefined,
  inceptionUnix?: number,
): number {
  const spec = bucketSpecForRange(range);
  const buckets = bucketTimestamps(range, nowSec, inceptionUnix);
  const start = historyStartSec ?? 0;
  return buckets.filter((t) => t + spec.stepSec >= start).length;
}

function printHistory(id: string, range: HistoryRange, res: TokenHistoryResponse) {
  const flat = longestIdenticalRunBuckets(res.points);
  const step = maxAdjacentStepPct(res.points);
  console.log(
    JSON.stringify({
      id,
      range,
      pointCount: res.points.length,
      partial: res.partial,
      historyStart: res.historyStart,
      longestFlatBuckets: flat.buckets,
      longestFlatPrice: flat.price || undefined,
      maxStepPct: Number(step.toFixed(4)),
    }),
  );
}

function compare1d1w(
  day: TokenHistoryResponse,
  week: TokenHistoryResponse,
): { compared: number; maxDiffPct: number } {
  const weekByT = new Map(week.points.map(([t, p]) => [t, p]));
  let compared = 0;
  let maxDiffPct = 0;
  for (const [t, pDay] of day.points) {
    const pWeek = weekByT.get(t);
    if (pWeek === undefined) continue;
    compared += 1;
    const d = new Decimal(pDay);
    const w = new Decimal(pWeek);
    if (d.eq(w)) continue;
    const base = d.abs().gt(w.abs()) ? d : w;
    if (base.lte(0)) continue;
    const pct = d.minus(w).div(base).abs().mul(100).toNumber();
    if (pct > maxDiffPct) maxDiffPct = pct;
  }
  return { compared, maxDiffPct };
}

async function main(): Promise<number> {
  const { resetHistoryBucketCacheForTests } = await import(
    "../app/lib/market-data/history-cache"
  );
  const { resetChainlinkClientsForTests } = await import(
    "../app/lib/market-data/chainlink"
  );
  const { getTokenHistory } = await import("../app/lib/market-data/service");
  const { getRegistryEntry } = await import("../app/lib/market-data/assets");

  resetHistoryBucketCacheForTests();
  resetChainlinkClientsForTests();

  const nowSec = Math.floor(Date.now() / 1000);
  let exitCode = 0;
  const ethByRange = new Map<HistoryRange, TokenHistoryResponse>();

  for (const id of CHECK_TOKENS) {
    const entry = getRegistryEntry(id);
    const inception = entry?.price.inceptionUnix;
    for (const range of RANGES) {
      const res = await getTokenHistory(id, range);
      printHistory(id, range, res);
      if (id === "eth") ethByRange.set(range, res);

      const expected = expectedPointCount(
        range,
        nowSec,
        res.historyStart,
        inception,
      );
      if (res.points.length !== expected && !res.unavailable) {
        console.error(
          `${id} ${range}: expected ${expected} points, got ${res.points.length}`,
        );
        exitCode = 1;
      }

      if (res.partial && res.points.length >= expected && !res.unavailable) {
        console.error(`${id} ${range}: partial=true on filled range`);
        exitCode = 1;
      }

      const maxStep = maxAdjacentStepPct(res.points);
      if (maxStep > 30) {
        console.error(`${id} ${range}: adjacent jump ${maxStep.toFixed(2)}%`);
        exitCode = 1;
      }

      if (FLAT_CHECK_RANGES.includes(range)) {
        const flat = longestIdenticalRunBuckets(res.points);
        if (flat.buckets > 3) {
          console.error(
            `${id} ${range}: ${flat.buckets} consecutive buckets at ${flat.price}`,
          );
          exitCode = 1;
        }
      }
    }
  }

  const day = ethByRange.get("1D");
  const week = ethByRange.get("1W");
  if (day && week) {
    const { compared, maxDiffPct } = compare1d1w(day, week);
    console.log(
      JSON.stringify({ check: "eth_1d_1w_overlap", compared, maxDiffPct }),
    );
    if (compared > 0 && maxDiffPct > 0.0001) {
      console.error(`ETH 1D vs 1W disagree by up to ${maxDiffPct}%`);
      exitCode = 1;
    }
  }

  const ethEntry = getRegistryEntry("eth");
  if (ethEntry) {
    const { chainlinkPriceProvider } = await import(
      "../app/lib/market-data/chainlink"
    );
    resetHistoryBucketCacheForTests();
    resetChainlinkClientsForTests();
    const spec = bucketSpecForRange("1Y");
    const buckets = bucketTimestamps("1Y", nowSec);
    const heartbeat = ethEntry.price.heartbeatS;
    const slop = acceptanceSlopSec(spec.stepSec, heartbeat);
    const { samples } = await chainlinkPriceProvider.readHistoryAtTimestamps(
      ethEntry,
      buckets,
      {
        stepSec: spec.stepSec,
        rangeFromSec: buckets[0] ?? nowSec,
        nowSec,
        specCount: spec.count,
        range: "1Y",
      },
    );
    for (const sample of samples) {
      const bucketEnd = sample.bucketStart + spec.stepSec;
      const minUpdatedAt = bucketEnd - (heartbeat + slop);
      if (
        sample.answerUpdatedAt !== undefined &&
        sample.answerUpdatedAt < minUpdatedAt
      ) {
        console.error(
          `ETH 1Y stale emit: bucketEnd=${bucketEnd} answerUpdatedAt=${sample.answerUpdatedAt} min=${minUpdatedAt}`,
        );
        exitCode = 1;
      }
      if (sample.t > nowSec) {
        console.error(`ETH 1Y future label t=${sample.t} now=${nowSec}`);
        exitCode = 1;
      }
    }
    console.log(
      JSON.stringify({
        check: "eth_1y_stale_emits",
        samples: samples.length,
        buckets: buckets.length,
      }),
    );
  }

  return exitCode;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(redactErrorMessage(err));
    process.exit(1);
  });
