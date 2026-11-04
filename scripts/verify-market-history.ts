/**
 * Real-RPC smoke check for Chainlink history resolution.
 *
 * Usage (from repo root):
 *   MARKET_DATA_RPC_KEY=… pnpm exec tsx scripts/verify-market-history.ts
 *
 * Uses MARKET_DATA_RPC_KEY (Dwellir archive) when set; otherwise the public
 * Base fallback from getMarketDataRpcUrl (non-production NODE_ENV).
 */

import { getTokenHistory } from "../app/lib/market-data/service";
import { resetHistoryBucketCacheForTests } from "../app/lib/market-data/history-cache";
import { resetChainlinkClientsForTests } from "../app/lib/market-data/chainlink";
import type { HistoryRange, TokenHistoryResponse } from "../app/lib/market-data/types";
import Decimal from "decimal.js";

const RANGES: HistoryRange[] = ["1D", "1W", "1M", "1Y", "ALL"];
const TOKENS = ["eth", "cngn", "usdc"] as const;

function longestIdenticalRunDays(
  points: Array<[number, string]>,
): { days: number; price: string; from: number; to: number } {
  if (points.length === 0) {
    return { days: 0, price: "", from: 0, to: 0 };
  }
  let best = { days: 0, price: points[0][1], from: points[0][0], to: points[0][0] };
  let runPrice = points[0][1];
  let runFrom = points[0][0];
  let runTo = points[0][0];

  for (let i = 1; i < points.length; i++) {
    const [t, p] = points[i];
    if (p === runPrice) {
      runTo = t;
    } else {
      const days = (runTo - runFrom) / 86400;
      if (days > best.days) {
        best = { days, price: runPrice, from: runFrom, to: runTo };
      }
      runPrice = p;
      runFrom = t;
      runTo = t;
    }
  }
  const tailDays = (runTo - runFrom) / 86400;
  if (tailDays > best.days) {
    best = { days: tailDays, price: runPrice, from: runFrom, to: runTo };
  }
  return best;
}

function maxStepPct(points: Array<[number, string]>): number {
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

function printHistory(id: string, range: HistoryRange, res: TokenHistoryResponse) {
  const run = longestIdenticalRunDays(res.points);
  const step = maxStepPct(res.points);
  console.log(
    JSON.stringify({
      id,
      range,
      pointCount: res.points.length,
      partial: res.partial,
      historyStart: res.historyStart,
      longestFlatDays: Number(run.days.toFixed(2)),
      longestFlatPrice: run.price || undefined,
      maxStepPct: Number(step.toFixed(4)),
      first: res.points[0],
      last: res.points[res.points.length - 1],
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
  resetHistoryBucketCacheForTests();
  resetChainlinkClientsForTests();

  const byRange = new Map<HistoryRange, TokenHistoryResponse>();

  for (const id of TOKENS) {
    for (const range of RANGES) {
      const res = await getTokenHistory(id, range);
      printHistory(id, range, res);
      if (id === "eth") byRange.set(range, res);
    }
  }

  const day = byRange.get("1D");
  const week = byRange.get("1W");
  let exitCode = 0;

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

  for (const range of RANGES) {
    const eth = byRange.get(range);
    if (!eth) continue;
    const run = longestIdenticalRunDays(eth.points);
    if (run.days > 3) {
      console.error(
        `ETH ${range}: identical price ${run.price} for ${run.days.toFixed(1)} days`,
      );
      exitCode = 1;
    }
  }

  return exitCode;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
