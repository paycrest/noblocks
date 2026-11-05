import {
  HISTORY_DEADLINE_MS,
  resolveHistoryWithFetcher,
  type PhaseTableRow,
  type RoundProbe,
} from "../app/lib/market-data/history-resolver";
import {
  type BatchFetchRoundData,
  type RoundDataResult,
} from "../app/lib/market-data/round-history";

export function roundResultsToProbeMap(
  rows: RoundDataResult[],
): Map<string, RoundProbe> {
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
}

export function batchFetchToProbes(
  batch: BatchFetchRoundData,
): (roundIds: bigint[]) => Promise<Map<string, RoundProbe>> {
  return async (roundIds) => roundResultsToProbeMap(await batch(roundIds));
}

export function singlePhaseRow(
  phaseId: number,
  firstTs: number,
  lastTs: number,
  lastRound: number | bigint,
): PhaseTableRow {
  return {
    phaseId,
    firstTs,
    lastTs,
    lastRound: BigInt(lastRound),
  };
}

export async function resolveHistoryWithBatchMock(
  batch: BatchFetchRoundData,
  phases: PhaseTableRow[],
  historyStartSec: number,
  bucketStarts: number[],
  stepSec: number,
  rangeFromSec: number,
  deadlineMs = HISTORY_DEADLINE_MS,
  feedHeartbeatSec = 1200,
  nowSec?: number,
) {
  const now = nowSec ?? bucketStarts[bucketStarts.length - 1] + stepSec;
  return resolveHistoryWithFetcher(
    batchFetchToProbes(batch),
    phases,
    historyStartSec,
    bucketStarts,
    stepSec,
    rangeFromSec,
    deadlineMs,
    feedHeartbeatSec,
    now,
  );
}

export function fillableBucketCount(
  bucketStarts: number[],
  stepSec: number,
  historyStartSec: number,
): number {
  return bucketStarts.filter((t) => t + stepSec >= historyStartSec).length;
}
