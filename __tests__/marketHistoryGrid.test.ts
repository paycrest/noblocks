import {
  resetHistoryBucketCacheForTests,
  setHistoryBucket,
  historyBucketKey,
} from "../app/lib/market-data/history-cache";
import {
  HISTORY_DEADLINE_MS,
  acceptanceSlopSec,
  resolveHistoryWithFetcher,
  shouldEmitTargetSample,
  targetStillNeedsWork,
  type PhaseRoundIndex,
  type PhaseTableRow,
  type RoundProbe,
} from "../app/lib/market-data/history-resolver";
import { decodeRoundId, encodeRoundId } from "../app/lib/market-data/round-id";
import {
  alignedRangeStart,
  bucketLabelTimestamp,
  bucketSpecForRange,
  bucketTimestamps,
  rangeStartUnix,
} from "../app/lib/market-data/series";
import {
  buildMockPhaseIndex,
  resolveHistoryWithBatchMock,
  singlePhaseRow,
} from "./historyResolverHarness";
import type { BatchFetchRoundData, RoundDataResult } from "../app/lib/market-data/round-history";

const NOW = 1_762_500_123;
const PHASE = 1;
const HEARTBEAT = 900;

function denseMock(maxAgg: number, nowSec: number): BatchFetchRoundData {
  return async (roundIds) =>
    roundIds.map((roundId): RoundDataResult => {
      const { phaseId, aggregatorRoundId } = decodeRoundId(roundId);
      const agg = Number(aggregatorRoundId);
      if (phaseId !== PHASE || agg < 1 || agg > maxAgg) {
        return { roundId, updatedAt: 0, answer: BigInt(0), ok: false };
      }
      return {
        roundId,
        updatedAt: nowSec - (maxAgg - agg) * HEARTBEAT,
        answer: 2_500_00000000n,
        ok: true,
      };
    });
}

describe("aligned history grid", () => {
  it("anchors bucket starts to step grid", () => {
    const spec = bucketSpecForRange("1D");
    const start = alignedRangeStart("1D", NOW);
    expect(start % spec.stepSec).toBe(0);
    const buckets = bucketTimestamps("1D", NOW);
    expect(buckets[0]).toBe(start);
    expect(buckets[1] - buckets[0]).toBe(spec.stepSec);
  });

  it("does not label points in the future", async () => {
    const maxAgg = 500;
    const spec = bucketSpecForRange("1D");
    const buckets = bucketTimestamps("1D", NOW);
    const historyStartSec = NOW - (maxAgg - 1) * HEARTBEAT;
    const phases = [singlePhaseRow(PHASE, historyStartSec, NOW, maxAgg)];

    const { samples } = await resolveHistoryWithBatchMock(
      denseMock(maxAgg, NOW),
      phases,
      historyStartSec,
      buckets,
      spec.stepSec,
      rangeStartUnix("1D", NOW),
      HISTORY_DEADLINE_MS,
      HEARTBEAT,
      NOW,
    );

    for (const s of samples) {
      expect(s.t).toBeLessThanOrEqual(NOW);
      expect(s.t).toBe(
        bucketLabelTimestamp(s.bucketStart, spec.stepSec, NOW),
      );
    }
  });

  it("two calls 1s apart share aligned bucket cache keys", () => {
    resetHistoryBucketCacheForTests();
    const spec = bucketSpecForRange("1W");
    const t0 = bucketTimestamps("1W", NOW);
    const t1 = bucketTimestamps("1W", NOW + 1);
    expect(t0).toEqual(t1);
    setHistoryBucket(
      historyBucketKey("eth", "1W", t0[0]),
      { t: bucketLabelTimestamp(t0[0], spec.stepSec, NOW), p: "1" },
      true,
    );
    const hit = bucketTimestamps("1W", NOW + 1);
    expect(hit[0]).toBe(t0[0]);
  });
});

describe("deadline preserves resolved targets", () => {
  it("emits only when round at-or-before is proven", () => {
    const target = {
      bucketStart: 1_700_000_000,
      bucketEnd: 1_700_086_400,
      phaseId: 1,
      lo: BigInt(100),
      hi: BigInt(50),
      done: false,
      answer: 123n,
      bestUpdatedAt: 1_700_000_000,
      phaseLastRound: BigInt(10_000),
      bestRoundAgg: BigInt(500),
      proven: false,
      widenSteps: 0,
    };
    expect(shouldEmitTargetSample(target)).toBe(false);
    target.proven = true;
    expect(shouldEmitTargetSample(target)).toBe(true);
    expect(targetStillNeedsWork(target)).toBe(false);
  });

  it("returns partial with cached probes when deadline stops further fetches", async () => {
    const maxAgg = 50_000;
    const spec = bucketSpecForRange("1Y");
    const buckets = bucketTimestamps("1Y", NOW);
    const historyStartSec = NOW - (maxAgg - 1) * HEARTBEAT;
    const phases: PhaseTableRow[] = [
      singlePhaseRow(PHASE, historyStartSec, NOW, maxAgg),
    ];
    const mock = denseMock(maxAgg, NOW);
    const indexes = new Map([
      [PHASE, await buildMockPhaseIndex(phases[0], mock)],
    ]);

    let calls = 0;
    const fetchProbes = async (roundIds: bigint[]) => {
      calls += 1;
      if (calls > 1) {
        await new Promise((r) => setTimeout(r, 200));
      }
      return mock(roundIds).then((rows) => {
        const map = new Map<string, RoundProbe>();
        for (const row of rows) {
          map.set(row.roundId.toString(), {
            roundId: row.roundId,
            updatedAt: row.updatedAt,
            answer: row.answer,
            ok: row.ok,
          });
        }
        return map;
      });
    };

    const result = await resolveHistoryWithFetcher(
      fetchProbes,
      phases,
      indexes,
      historyStartSec,
      buckets,
      spec.stepSec,
      rangeStartUnix("1Y", NOW),
      60,
      HEARTBEAT,
      NOW,
    );

    expect(result.samples.length).toBeGreaterThan(0);
    if (result.samples.length < buckets.length) {
      expect(result.partial).toBe(true);
    }
  });
});

describe("1D/1W overlap on aligned grid", () => {
  it("compares >0 overlapping bucket-end timestamps", async () => {
    const maxAgg = 500;
    const mock = denseMock(maxAgg, NOW);
    const historyStartSec = NOW - (maxAgg - 1) * HEARTBEAT;
    const phases = [singlePhaseRow(PHASE, historyStartSec, NOW, maxAgg)];
    const spec1d = bucketSpecForRange("1D");
    const buckets1d = bucketTimestamps("1D", NOW);
    const spec1w = bucketSpecForRange("1W");
    const buckets1w = bucketTimestamps("1W", NOW);

    const day = await resolveHistoryWithBatchMock(
      mock,
      phases,
      historyStartSec,
      buckets1d,
      spec1d.stepSec,
      rangeStartUnix("1D", NOW),
      HISTORY_DEADLINE_MS,
      HEARTBEAT,
      NOW,
    );
    const week = await resolveHistoryWithBatchMock(
      mock,
      phases,
      historyStartSec,
      buckets1w,
      spec1w.stepSec,
      rangeStartUnix("1W", NOW),
      HISTORY_DEADLINE_MS,
      HEARTBEAT,
      NOW,
    );

    const weekByEnd = new Map(week.samples.map((s) => [s.t, s.answer]));
    let compared = 0;
    for (const s of day.samples) {
      const w = weekByEnd.get(s.t);
      if (w === undefined) continue;
      expect(w).toBe(s.answer);
      compared += 1;
    }
    expect(compared).toBeGreaterThan(0);
  });
});
