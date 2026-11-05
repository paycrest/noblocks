import { decodeRoundId, encodeRoundId } from "../app/lib/market-data/round-id";
import {
  canProveRoundAtOrBefore,
  narrowTargetInterval,
  type HistoryTarget,
  type RoundProbe,
} from "../app/lib/market-data/history-resolver";
import {
  resolveHistoryWithBatchMock,
  singlePhaseRow,
} from "./historyResolverHarness";
import type { BatchFetchRoundData, RoundDataResult } from "../app/lib/market-data/round-history";

const PHASE = 1;
const NOW = 1_762_700_000;
const HEARTBEAT = 900;

function makeTarget(overrides: Partial<HistoryTarget> = {}): HistoryTarget {
  return {
    bucketStart: NOW - 3600,
    bucketEnd: NOW,
    phaseId: PHASE,
    lo: BigInt(1),
    hi: BigInt(8),
    done: false,
    answer: BigInt(0),
    bestUpdatedAt: 0,
    phaseLastRound: BigInt(8),
    bestRoundAgg: BigInt(0),
    proven: false,
    widenSteps: 0,
    ...overrides,
  };
}

describe("converged narrow search", () => {
  it("sets bestRoundAgg when narrowing a window of at most 8 rounds", () => {
    const bucketEnd = NOW;
    const probes = new Map<string, RoundProbe>();
    for (let agg = 1; agg <= 8; agg++) {
      const roundId = encodeRoundId(PHASE, BigInt(agg));
      probes.set(roundId.toString(), {
        roundId,
        updatedAt: bucketEnd - (8 - agg) * 60,
        answer: BigInt(1000 + agg),
        ok: true,
      });
    }
    const target = makeTarget({
      lo: BigInt(1),
      hi: BigInt(8),
      bucketEnd,
    });
    narrowTargetInterval(target, probes);
    expect(target.hi).toBeLessThan(target.lo);
    expect(target.bestRoundAgg).toBe(BigInt(8));
    expect(target.answer).toBe(BigInt(1008));
  });

  it("does not prove when the successor round was never fetched", () => {
    const target = makeTarget({
      answer: 100n,
      bestUpdatedAt: NOW - 5000,
      bestRoundAgg: BigInt(5),
      lo: BigInt(6),
      hi: BigInt(4),
      phaseLastRound: BigInt(8),
      bucketEnd: NOW,
    });
    const probes = new Map<string, RoundProbe>();
    probes.set(encodeRoundId(PHASE, BigInt(5)).toString(), {
      roundId: encodeRoundId(PHASE, BigInt(5)),
      updatedAt: NOW - 5000,
      answer: 100n,
      ok: true,
    });
    expect(canProveRoundAtOrBefore(target, probes, 3600, HEARTBEAT)).toBe(
      false,
    );
  });

  it("resolves every round in a narrow 8-round phase window", async () => {
    const maxAgg = 8;
    const mock: BatchFetchRoundData = async (roundIds) =>
      roundIds.map((roundId): RoundDataResult => {
        const { phaseId, aggregatorRoundId } = decodeRoundId(roundId);
        const agg = Number(aggregatorRoundId);
        if (phaseId !== PHASE || agg < 1 || agg > maxAgg) {
          return { roundId, updatedAt: 0, answer: BigInt(0), ok: false };
        }
        return {
          roundId,
          updatedAt: NOW - (maxAgg - agg) * HEARTBEAT,
          answer: BigInt(2_000_000 + agg),
          ok: true,
        };
      });

    const historyStartSec = NOW - maxAgg * HEARTBEAT;
    const phase = singlePhaseRow(PHASE, historyStartSec, NOW, maxAgg);
    const stepSec = HEARTBEAT;
    const bucketStarts = [NOW - 3 * stepSec, NOW - 2 * stepSec, NOW - stepSec];

    const { samples, partial } = await resolveHistoryWithBatchMock(
      mock,
      [phase],
      historyStartSec,
      bucketStarts,
      stepSec,
      bucketStarts[0],
      8_000,
      HEARTBEAT,
      NOW,
    );

    expect(partial).toBe(false);
    expect(samples.length).toBe(bucketStarts.length);
    for (const sample of samples) {
      expect(sample.answerUpdatedAt).toBeLessThanOrEqual(
        Math.min(sample.bucketStart + stepSec, NOW),
      );
    }
  });
});
