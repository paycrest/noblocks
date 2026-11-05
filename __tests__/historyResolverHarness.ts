import {
  HISTORY_DEADLINE_MS,
  resolveHistoryWithFetcher,
  sampleRoundIdsForIndex,
  type PhaseTableRow,
  type PhaseRoundIndex,
  type RoundProbe,
} from "../app/lib/market-data/history-resolver";
import {
  type BatchFetchRoundData,
  type RoundDataResult,
} from "../app/lib/market-data/round-history";
import { decodeRoundId } from "../app/lib/market-data/round-id";

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

export async function buildMockPhaseIndex(
  phase: PhaseTableRow,
  batch: BatchFetchRoundData,
): Promise<PhaseRoundIndex> {
  const roundIds = sampleRoundIdsForIndex(phase.phaseId, phase.lastRound);
  const rows = await batch(roundIds);
  const points = rows
    .filter((r) => r.ok && r.updatedAt > 0)
    .map((r) => ({
      round: decodeRoundId(r.roundId).aggregatorRoundId,
      updatedAt: r.updatedAt,
    }))
    .sort((a, b) => (a.round < b.round ? -1 : a.round > b.round ? 1 : 0));
  return {
    phaseId: phase.phaseId,
    points,
    closed: true,
    fetchedAt: Date.now(),
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
  indexes?: Map<number, PhaseRoundIndex>,
) {
  const now = nowSec ?? bucketStarts[bucketStarts.length - 1] + stepSec;
  const indexMap = indexes ?? new Map<number, PhaseRoundIndex>();
  if (!indexes) {
    for (const phase of phases) {
      indexMap.set(phase.phaseId, await buildMockPhaseIndex(phase, batch));
    }
  }
  return resolveHistoryWithFetcher(
    batchFetchToProbes(batch),
    phases,
    indexMap,
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
