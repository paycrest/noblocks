import {
  bucketSpecForRange,
  bucketTimestamps,
  rangeStartUnix,
} from "../app/lib/market-data/series";
import {
  buildHistorySamples,
  createHistoryBudget,
  estimateHistoryRpcCalls,
  HISTORY_DEADLINE_MS,
  type BatchFetchRoundData,
} from "../app/lib/market-data/round-history";
import { decodeRoundId, encodeRoundId } from "../app/lib/market-data/round-id";

/** Simulates Base ETH SVR phase 1 with ~1200s heartbeat and enough rounds for 1Y. */
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
  const latestRoundId = encodeRoundId(PHASE, BigInt(MAX_AGG));
  const batchFetch = ethArchiveBatchFetch(nowSec);

  it("estimates ≤10 round-trips including latest for ETH ranges", () => {
    for (const range of ["1D", "1W", "1M", "1Y"] as const) {
      const count = bucketSpecForRange(range).count;
      expect(estimateHistoryRpcCalls(count)).toBeLessThanOrEqual(10);
    }
  });

  it.each(["1D", "1W", "1M", "1Y"] as const)(
    "fills ≥90%% of %s buckets within deadline with ≤10 multicall round-trips",
    async (range) => {
      const spec = bucketSpecForRange(range);
      const buckets = bucketTimestamps(range, nowSec);
      const from = rangeStartUnix(range, nowSec);
      const budget = createHistoryBudget(HISTORY_DEADLINE_MS);
      const initialCalls = budget.callsLeft;

      const { samples } = await buildHistorySamples(
        batchFetch,
        budget,
        latestRoundId,
        buckets,
        spec.stepSec,
        from,
        false,
      );

      const rpcTrips = initialCalls - budget.callsLeft;
      expect(samples.length / buckets.length).toBeGreaterThanOrEqual(0.9);
      expect(rpcTrips).toBeLessThanOrEqual(10);
    },
    60_000,
  );
});
