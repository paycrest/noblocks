import {
  buildHistorySamples,
  createHistoryBudget,
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

const NOW = 1_762_000_000;
const PHASE = 1;
const HEARTBEAT = 900;
const PRICE = 2_439_96000000n;

function ethMock(maxAgg: number): BatchFetchRoundData {
  return async (roundIds) =>
    roundIds.map((roundId): RoundDataResult => {
      const { phaseId, aggregatorRoundId } = decodeRoundId(roundId);
      const agg = Number(aggregatorRoundId);
      if (phaseId !== PHASE || agg < 1 || agg > maxAgg) {
        return { roundId, updatedAt: 0, answer: BigInt(0), ok: false };
      }
      return {
        roundId,
        updatedAt: NOW - (maxAgg - agg) * HEARTBEAT,
        answer: PRICE,
        ok: true,
      };
    });
}

describe("history point timestamps", () => {
  it("labels points at bucket end (not bucket start)", async () => {
    const maxAgg = 120;
    const latestRoundId = encodeRoundId(PHASE, BigInt(maxAgg));
    const buckets = bucketTimestamps("1D", NOW);
    const spec = bucketSpecForRange("1D");
    const budget = createHistoryBudget(HISTORY_DEADLINE_MS);

    const { samples } = await buildHistorySamples(
      ethMock(maxAgg),
      budget,
      latestRoundId,
      buckets,
      spec.stepSec,
      rangeStartUnix("1D", NOW),
      false,
    );

    expect(samples[0].t).toBe(buckets[0] + spec.stepSec);
    expect(samples[0].bucketStart).toBe(buckets[0]);
  });

  it("1D and 1W agree on price for overlapping bucket-end times", async () => {
    const maxAgg = 500;
    const latestRoundId = encodeRoundId(PHASE, BigInt(maxAgg));
    const mock = ethMock(maxAgg);
    const budget1 = createHistoryBudget(HISTORY_DEADLINE_MS);
    const spec1d = bucketSpecForRange("1D");
    const buckets1d = bucketTimestamps("1D", NOW);
    const from1d = rangeStartUnix("1D", NOW);

    const day = await buildHistorySamples(
      mock,
      budget1,
      latestRoundId,
      buckets1d,
      spec1d.stepSec,
      from1d,
      false,
    );

    const budget2 = createHistoryBudget(HISTORY_DEADLINE_MS);
    const spec1w = bucketSpecForRange("1W");
    const buckets1w = bucketTimestamps("1W", NOW);
    const from1w = rangeStartUnix("1W", NOW);

    const week = await buildHistorySamples(
      mock,
      budget2,
      latestRoundId,
      buckets1w,
      spec1w.stepSec,
      from1w,
      false,
    );

    const weekByEnd = new Map(week.samples.map((s) => [s.t, s.answer]));
    let compared = 0;
    for (const s of day.samples) {
      const w = weekByEnd.get(s.t);
      if (w === undefined) continue;
      expect(w).toBe(s.answer);
      compared += 1;
    }
    expect(compared).toBeGreaterThan(10);
  });
});
