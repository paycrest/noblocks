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
const PHASE1_START = NOW - 400 * 86400;
const PHASE2_START = NOW - 100 * 86400;

function twoPhaseCngnMock(latestRoundId: bigint): BatchFetchRoundData {
  return async (roundIds) =>
    roundIds.map((roundId): RoundDataResult => {
      const { phaseId, aggregatorRoundId } = decodeRoundId(roundId);
      const agg = Number(aggregatorRoundId);
      if (phaseId === 1) {
        if (agg < 1 || agg > 200) {
          return { roundId, updatedAt: 0, answer: BigInt(0), ok: false };
        }
        return {
          roundId,
          updatedAt: PHASE1_START + agg * 86400,
          answer: BigInt(65_019 + agg),
          ok: true,
        };
      }
      if (phaseId === 2) {
        if (agg < 1 || agg > 120) {
          return { roundId, updatedAt: 0, answer: BigInt(0), ok: false };
        }
        return {
          roundId,
          updatedAt: PHASE2_START + agg * 86400,
          answer: BigInt(73_600 + agg),
          ok: true,
        };
      }
      return { roundId, updatedAt: 0, answer: BigInt(0), ok: false };
    });
}

describe("multi-phase timeline sampling", () => {
  it("samples both phases with varying prices across a 1Y window", async () => {
    const latestRoundId = encodeRoundId(2, BigInt(120));
    const range = "1Y" as const;
    const spec = bucketSpecForRange(range);
    const buckets = bucketTimestamps(range, NOW);
    const from = rangeStartUnix(range, NOW);
    const budget = createHistoryBudget(HISTORY_DEADLINE_MS);

    const { samples, partial } = await buildHistorySamples(
      twoPhaseCngnMock(latestRoundId),
      budget,
      latestRoundId,
      buckets,
      spec.stepSec,
      from,
      false,
    );

    expect(samples.length).toBe(
      buckets.filter((t) => t + spec.stepSec > PHASE1_START).length,
    );
    const phase1Samples = samples.filter((s) => s.t < PHASE2_START);
    const uniquePhase1 = new Set(phase1Samples.map((s) => s.answer.toString()));
    expect(uniquePhase1.size).toBeGreaterThan(5);
    expect(partial).toBe(false);
  });
});
