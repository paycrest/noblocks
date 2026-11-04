import { ASSET_REGISTRY, historyFeedFor } from "../app/lib/market-data/assets";
import {
  assignSamplesToBucketTimes,
  buildHistorySamples,
  createHistoryBudget,
  fillableBucketCount,
  HISTORY_DEADLINE_MS,
  type BatchFetchRoundData,
  type RoundDataResult,
} from "../app/lib/market-data/round-history";
import {
  bucketSpecForRange,
  bucketTimestamps,
  rangeStartUnix,
} from "../app/lib/market-data/series";
import { decodeRoundId, encodeRoundId } from "../app/lib/market-data/round-id";

/** Dense ETH-like updates (~20 min) with long round span. */
function denseEthMock(
  phase: number,
  maxAgg: number,
  heartbeatSec: number,
  nowSec: number,
): BatchFetchRoundData {
  return async (roundIds) =>
    roundIds.map((roundId): RoundDataResult => {
      const { phaseId, aggregatorRoundId } = decodeRoundId(roundId);
      const agg = Number(aggregatorRoundId);
      if (phaseId !== phase || agg < 1 || agg > maxAgg) {
        return { roundId, updatedAt: 0, answer: BigInt(0), ok: false };
      }
      return {
        roundId,
        updatedAt: nowSec - (maxAgg - agg) * heartbeatSec,
        answer: 2_500_00000000n,
        ok: true,
      };
    });
}

/** Sparse USDC-like updates: new round only every `intervalSec`. */
function sparseStableMock(
  phase: number,
  maxAgg: number,
  intervalSec: number,
  historyStartSec: number,
): BatchFetchRoundData {
  return async (roundIds) =>
    roundIds.map((roundId): RoundDataResult => {
      const { phaseId, aggregatorRoundId } = decodeRoundId(roundId);
      const agg = Number(aggregatorRoundId);
      if (phaseId !== phase || agg < 1 || agg > maxAgg) {
        return { roundId, updatedAt: 0, answer: BigInt(0), ok: false };
      }
      return {
        roundId,
        updatedAt: historyStartSec + (agg - 1) * intervalSec,
        answer: 99983000n,
        ok: true,
      };
    });
}

describe("bucket carry-forward semantics", () => {
  it("fills every bucket after historyStart with latest round at or before bucket end", () => {
    const historyStart = 1_000;
    const step = 100;
    const buckets = [900, 1000, 1100, 1200];
    const rounds = [
      { roundId: 1n, updatedAt: 1000, answer: 10n },
      { roundId: 2n, updatedAt: 1150, answer: 20n },
    ];
    const mapped = assignSamplesToBucketTimes(buckets, step, rounds, historyStart);
    expect(mapped.map((m) => m.labelT)).toEqual([1100, 1200, 1300]);
    expect(mapped[0].answer).toBe(10n);
    expect(mapped[1].answer).toBe(20n);
    expect(mapped[2].answer).toBe(20n);
  });
});

describe("long-range history with irregular feeds", () => {
  const nowSec = 1_762_000_000;
  const phase = 1;

  it("fills ETH 1Y from feed inception through now", async () => {
    const maxAgg = 30_000;
    const heartbeat = 1200;
    const latestRoundId = encodeRoundId(phase, BigInt(maxAgg));
    const range = "1Y" as const;
    const spec = bucketSpecForRange(range);
    const buckets = bucketTimestamps(range, nowSec);
    const from = rangeStartUnix(range, nowSec);
    const historyStartSec = nowSec - (maxAgg - 1) * heartbeat;
    const budget = createHistoryBudget(HISTORY_DEADLINE_MS);

    const { samples, partial, historyStartSec: resolvedStart } =
      await buildHistorySamples(
        denseEthMock(phase, maxAgg, heartbeat, nowSec),
        budget,
        latestRoundId,
        buckets,
        spec.stepSec,
        from,
        false,
      );

    expect(resolvedStart).toBe(historyStartSec);
    const fillable = fillableBucketCount(buckets, spec.stepSec, historyStartSec);
    expect(samples.length).toBeGreaterThanOrEqual(Math.floor(fillable * 0.99));
    expect(partial).toBe(false);
  });

  it("fills USDC 1Y with sparse round updates", async () => {
    const maxAgg = 400;
    const intervalSec = 86400;
    const historyStartSec = nowSec - (maxAgg - 1) * intervalSec;
    const latestRoundId = encodeRoundId(phase, BigInt(maxAgg));
    const range = "1Y" as const;
    const spec = bucketSpecForRange(range);
    const buckets = bucketTimestamps(range, nowSec);
    const from = rangeStartUnix(range, nowSec);
    const budget = createHistoryBudget(HISTORY_DEADLINE_MS);

    const { samples } = await buildHistorySamples(
      sparseStableMock(phase, maxAgg, intervalSec, historyStartSec),
      budget,
      latestRoundId,
      buckets,
      spec.stepSec,
      from,
      false,
    );

    const fillable = fillableBucketCount(buckets, spec.stepSec, historyStartSec);
    expect(samples.length).toBe(fillable);
  });

  it("ALL weekly buckets cover through the latest round (no gap before now)", async () => {
    const maxAgg = 2_000;
    const heartbeat = 3600;
    const latestRoundId = encodeRoundId(phase, BigInt(maxAgg));
    const range = "ALL" as const;
    const spec = bucketSpecForRange(range);
    const historyStartSec = nowSec - (maxAgg - 1) * heartbeat;
    const buckets = bucketTimestamps(range, nowSec, historyStartSec);
    const from = rangeStartUnix(range, nowSec, historyStartSec);
    const budget = createHistoryBudget(HISTORY_DEADLINE_MS);

    const { samples } = await buildHistorySamples(
      denseEthMock(phase, maxAgg, heartbeat, nowSec),
      budget,
      latestRoundId,
      buckets,
      spec.stepSec,
      from,
      true,
    );

    expect(samples.length).toBeGreaterThanOrEqual(buckets.length - 1);
    const lastBucket = buckets[buckets.length - 1];
    expect(samples.some((s) => s.bucketStart === lastBucket || s.t === lastBucket + spec.stepSec)).toBe(true);
    const lastSample = samples[samples.length - 1];
    expect(lastSample.t).toBeGreaterThanOrEqual(lastBucket + spec.stepSec - 1);
  });
});

describe("feed history start expectations", () => {
  it("uses SVR for ETH live price and secondary proxy for history", () => {
    expect(ASSET_REGISTRY.eth.price.proxy).toBe(
      "0x50015f8b17fb2C290Dde41fDc246ed0dcEE93a8b",
    );
    expect(ASSET_REGISTRY.eth.historyProxy?.proxy).toBe(
      "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",
    );
    expect(historyFeedFor(ASSET_REGISTRY.eth).proxy).toBe(
      "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",
    );
  });
});
