import {
  bracketIntervalForBucketEnd,
  expandTargetInterval,
  initHistoryTargets,
  shouldEmitTargetSample,
  type PhaseRoundIndex,
} from "../app/lib/market-data/history-resolver";
import { singlePhaseRow } from "./historyResolverHarness";

const NOW = 1_762_600_000;
const PHASE = 1;
const MAX_AGG = 20_000;

function burstyTimestamp(agg: number): number {
  const base = NOW - MAX_AGG * 120;
  if (agg < 5000) return base + agg * 60;
  if (agg < 15000) return base + 5000 * 60 + (agg - 5000) * 3600;
  return base + 5000 * 60 + 10000 * 3600 + (agg - 15000) * 120;
}

function burstyIndex(): PhaseRoundIndex {
  const points: PhaseRoundIndex["points"] = [];
  for (let agg = 1; agg <= MAX_AGG; agg += 32) {
    points.push({ round: BigInt(agg), updatedAt: burstyTimestamp(agg) });
  }
  return { phaseId: PHASE, points, closed: true, fetchedAt: Date.now() };
}

describe("bursty phase index brackets", () => {
  it("brackets bucketEnd from index even when round density is non-linear in time", () => {
    const phase = singlePhaseRow(PHASE, burstyTimestamp(1), NOW, MAX_AGG);
    const index = burstyIndex();
    const bucketEnd = Math.floor(NOW / 3600) * 3600;
    const { lo, hi } = bracketIntervalForBucketEnd(index, phase, bucketEnd);
    expect(lo).toBeLessThanOrEqual(hi);
    expect(lo).toBeGreaterThanOrEqual(BigInt(1));
    expect(hi).toBeLessThanOrEqual(phase.lastRound);
  });

  it("widens interval when hi<lo instead of marking done with stale answer", () => {
    const phase = singlePhaseRow(PHASE, burstyTimestamp(1), NOW, MAX_AGG);
    const index = burstyIndex();
    const bucketEnd = Math.floor(NOW / 3600) * 3600;
    const targets = initHistoryTargets(
      [bucketEnd - 3600],
      3600,
      [phase],
      burstyTimestamp(1),
      new Map([[PHASE, index]]),
    );
    expect(targets.length).toBe(1);
    const target = targets[0];
    target.lo = BigInt(12_000);
    target.hi = BigInt(4_000);
    target.answer = 999n;
    target.bestUpdatedAt = bucketEnd - 200_000;
    target.bestRoundAgg = BigInt(8000);
    target.proven = false;

    expect(shouldEmitTargetSample(target)).toBe(false);

    expandTargetInterval(target, index, phase);
    expect(target.lo).toBeLessThanOrEqual(target.hi);
    expect(target.proven).toBe(false);
    expect(target.answer).toBe(BigInt(0));
  });
});
