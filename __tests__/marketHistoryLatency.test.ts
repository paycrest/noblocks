import {
  bucketSpecForRange,
  bucketTimestamps,
  rangeStartUnix,
} from "../app/lib/market-data/series";
import {
  estimateHistoryRpcCalls,
  HISTORY_DEADLINE_MS,
} from "../app/lib/market-data/history-resolver";
import {
  resolveHistoryWithBatchMock,
  singlePhaseRow,
} from "./historyResolverHarness";
import {
  type BatchFetchRoundData,
  type RoundDataResult,
} from "../app/lib/market-data/round-history";
import { decodeRoundId, encodeRoundId } from "../app/lib/market-data/round-id";

const PHASE = 1;
const MAX_AGG = 30_000;
const HEARTBEAT_SEC = 1200;
const CALL_LATENCY_MS = 700;
const NOW_SEC = 1_762_000_000;

function ethArchiveBatchFetch(nowSec: number): BatchFetchRoundData {
  return async (roundIds) => {
    await new Promise((r) => setTimeout(r, CALL_LATENCY_MS));
    return roundIds.map((roundId) => {
      const { phaseId, aggregatorRoundId } = decodeRoundId(roundId);
      const agg = Number(aggregatorRoundId);
      if (
        phaseId !== PHASE ||
        agg < 1 ||
        agg > MAX_AGG ||
        !Number.isFinite(agg)
      ) {
        return {
          roundId,
          updatedAt: 0,
          answer: BigInt(0),
          ok: false,
        };
      }
      return {
        roundId,
        updatedAt: nowSec - (MAX_AGG - agg) * HEARTBEAT_SEC,
        answer: 2_500_00000000n,
        ok: true,
      };
    });
  };
}

describe("history sampling under archive RPC latency", () => {
  const nowSec = NOW_SEC;
  const batchFetch = ethArchiveBatchFetch(nowSec);
  const historyStartSec = nowSec - (MAX_AGG - 1) * HEARTBEAT_SEC;
  const phases = [singlePhaseRow(PHASE, historyStartSec, nowSec, MAX_AGG)];

  it("estimates multicall batches for ETH ranges (phase table + k-ary search)", () => {
    for (const range of ["1D", "1W", "1M", "1Y"] as const) {
      const count = bucketSpecForRange(range).count;
      const estimate = estimateHistoryRpcCalls(count);
      expect(estimate).toBeGreaterThanOrEqual(5);
      expect(estimate).toBeLessThanOrEqual(20);
    }
  });

  it.each(["1D", "1W", "1M", "1Y"] as const)(
    "fills ≥90%% of %s buckets within deadline",
    async (range) => {
      const spec = bucketSpecForRange(range);
      const buckets = bucketTimestamps(range, nowSec);
      const from = rangeStartUnix(range, nowSec);

      const { samples } = await resolveHistoryWithBatchMock(
        batchFetch,
        phases,
        historyStartSec,
        buckets,
        spec.stepSec,
        from,
        HISTORY_DEADLINE_MS,
      );

      expect(samples.length / buckets.length).toBeGreaterThanOrEqual(0.9);
    },
    60_000,
  );
});
