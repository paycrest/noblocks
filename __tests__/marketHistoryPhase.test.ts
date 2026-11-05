import {
  resolveHistoryWithBatchMock,
  singlePhaseRow,
} from "./historyResolverHarness";
import {
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

function twoPhaseCngnMock(): BatchFetchRoundData {
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

describe("multi-phase k-ary history resolver", () => {
  it("samples both phases with varying prices across a 1Y window", async () => {
    const range = "1Y" as const;
    const spec = bucketSpecForRange(range);
    const buckets = bucketTimestamps(range, NOW);
    const from = rangeStartUnix(range, NOW);
    const phases = [
      singlePhaseRow(1, PHASE1_START + 86400, PHASE2_START - 1, 200),
      singlePhaseRow(2, PHASE2_START + 86400, NOW, 120),
    ];
    const historyStartSec = PHASE1_START + 86400;

    const { samples, partial } = await resolveHistoryWithBatchMock(
      twoPhaseCngnMock(),
      phases,
      historyStartSec,
      buckets,
      spec.stepSec,
      from,
    );

    expect(samples.length).toBe(
      buckets.filter((t) => t + spec.stepSec > historyStartSec).length,
    );
    const phase1Samples = samples.filter((s) => s.t < PHASE2_START);
    const uniquePhase1 = new Set(phase1Samples.map((s) => s.answer.toString()));
    expect(uniquePhase1.size).toBeGreaterThan(5);
    expect(partial).toBe(false);
  });
});
