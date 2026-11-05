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

const PHASE = 1;
const HEARTBEAT_SEC = 900;
const NOW_SEC = 1_762_000_000;
const LOW = 2_318_40000000n;
const HIGH = 2_439_96000000n;
const JUMP_AT = NOW_SEC - 6 * HEARTBEAT_SEC;

function eth1dMock(maxAgg: number): BatchFetchRoundData {
  return async (roundIds) =>
    roundIds.map((roundId): RoundDataResult => {
      const { phaseId, aggregatorRoundId } = decodeRoundId(roundId);
      const agg = Number(aggregatorRoundId);
      if (phaseId !== PHASE || agg < 1 || agg > maxAgg) {
        return { roundId, updatedAt: 0, answer: BigInt(0), ok: false };
      }
      const updatedAt = NOW_SEC - (maxAgg - agg) * HEARTBEAT_SEC;
      const answer = updatedAt >= JUMP_AT ? HIGH : LOW;
      return { roundId, updatedAt, answer, ok: true };
    });
}

describe("1D history regression (k-ary resolver)", () => {
  it("reflects a mid-window price change in every 15m bucket", async () => {
    const maxAgg = 120;
    const range = "1D" as const;
    const spec = bucketSpecForRange(range);
    const buckets = bucketTimestamps(range, NOW_SEC);
    const from = rangeStartUnix(range, NOW_SEC);
    const historyStartSec = NOW_SEC - (maxAgg - 1) * HEARTBEAT_SEC;
    const phases = [singlePhaseRow(PHASE, historyStartSec, NOW_SEC, maxAgg)];

    const { samples, partial } = await resolveHistoryWithBatchMock(
      eth1dMock(maxAgg),
      phases,
      historyStartSec,
      buckets,
      spec.stepSec,
      from,
    );

    expect(samples.length).toBe(buckets.length);
    expect(partial).toBe(false);

    const firstHighIdx = samples.findIndex((s) => s.answer === HIGH);
    expect(firstHighIdx).toBeGreaterThan(0);
    expect(samples.slice(0, firstHighIdx).every((s) => s.answer === LOW)).toBe(
      true,
    );
    expect(samples.slice(firstHighIdx).every((s) => s.answer === HIGH)).toBe(
      true,
    );
    expect(samples[samples.length - 1].answer).toBe(HIGH);
  });
});
