import "server-only";

import Decimal from "decimal.js";
import type { HistoryRange } from "./types";

export interface SeriesBucketSpec {
  count: number;
  stepSec: number;
}

export function bucketSpecForRange(range: HistoryRange): SeriesBucketSpec {
  switch (range) {
    case "1D":
      return { count: 96, stepSec: 15 * 60 };
    case "1W":
      return { count: 168, stepSec: 60 * 60 };
    case "1M":
      return { count: 120, stepSec: 6 * 60 * 60 };
    case "1Y":
      return { count: 365, stepSec: 24 * 60 * 60 };
    case "ALL":
      return { count: 200, stepSec: 7 * 24 * 60 * 60 };
    default:
      return { count: 96, stepSec: 15 * 60 };
  }
}

export function rangeStartUnix(
  range: HistoryRange,
  nowSec: number,
  inceptionUnix?: number,
): number {
  const spec = bucketSpecForRange(range);
  if (range === "ALL") {
    return inceptionUnix ?? nowSec - spec.count * spec.stepSec;
  }
  return nowSec - spec.count * spec.stepSec;
}

export function bucketTimestamps(
  range: HistoryRange,
  nowSec: number,
  inceptionUnix?: number,
): number[] {
  const spec = bucketSpecForRange(range);
  const start =
    range === "ALL"
      ? (inceptionUnix ?? nowSec - spec.count * spec.stepSec)
      : nowSec - spec.count * spec.stepSec;
  const out: number[] = [];
  for (let i = 0; i < spec.count; i++) {
    const t = start + i * spec.stepSec;
    if (t > nowSec) break;
    out.push(t);
  }
  return out;
}

export interface RawPoint {
  t: number;
  p: string;
}

/**
 * Drop spikes: ≤0, or > threshold off rolling median of ±3 neighbours.
 * Stablecoins and NGN use 5%; others 25%.
 */
export function applySpikeFilter(
  points: RawPoint[],
  options: { stableOrNgn: boolean; stepSec?: number },
): RawPoint[] {
  if (options.stepSec !== undefined && options.stepSec >= 86400) {
    return points.filter((pt) => new Decimal(pt.p).gt(0));
  }

  const thresholdPct = options.stableOrNgn ? 5 : 25;
  const result: RawPoint[] = [];

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const price = new Decimal(pt.p);
    if (price.lte(0)) {
      continue;
    }
    const neighbours: Decimal[] = [];
    for (let j = Math.max(0, i - 3); j <= Math.min(points.length - 1, i + 3); j++) {
      if (j === i) continue;
      const n = new Decimal(points[j].p);
      if (n.gt(0)) neighbours.push(n);
    }
    if (neighbours.length === 0) {
      result.push(pt);
      continue;
    }
    const sorted = [...neighbours].sort((a, b) => a.cmp(b));
    const mid = sorted[Math.floor(sorted.length / 2)];
    if (mid.isZero()) {
      result.push(pt);
      continue;
    }
    const deviation = price.minus(mid).abs().div(mid).mul(100);
    if (deviation.lte(thresholdPct)) {
      result.push(pt);
    }
  }
  return result;
}

export function toHistoryTuples(points: RawPoint[]): Array<[number, string]> {
  return points.map((p) => [p.t, p.p]);
}
