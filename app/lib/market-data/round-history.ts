import "server-only";

import type { HistoryRange } from "./types";
import { bucketSpecForRange } from "./series";
import { decodeRoundId, encodeRoundId, spaceSampleRoundIds } from "./round-id";

export const HISTORY_DEADLINE_MS = 8_000;
/** Hard cap on eth_call / multicall sub-calls per history request. */
export const HISTORY_MAX_RPC_CALLS = 64;
export const HISTORY_MULTICALL_CHUNK = 32;
export const HISTORY_BINARY_SEARCH_MAX_ITER = 14;

export interface RoundSample {
  roundId: bigint;
  updatedAt: number;
  answer: bigint;
}

export interface RoundDataResult {
  roundId: bigint;
  updatedAt: number;
  answer: bigint;
  ok: boolean;
}

export type FetchRoundData = (
  roundId: bigint,
) => Promise<RoundDataResult | null>;

export interface HistoryFetchBudget {
  deadlineAtMs: number;
  callsLeft: number;
}

export function createHistoryBudget(
  deadlineMs = HISTORY_DEADLINE_MS,
): HistoryFetchBudget {
  return {
    deadlineAtMs: Date.now() + deadlineMs,
    callsLeft: HISTORY_MAX_RPC_CALLS,
  };
}

export function budgetExpired(budget: HistoryFetchBudget): boolean {
  return (
    Date.now() >= budget.deadlineAtMs || budget.callsLeft <= 0
  );
}

export function consumeBudget(
  budget: HistoryFetchBudget,
  n = 1,
): boolean {
  if (budget.callsLeft < n) {
    budget.callsLeft = 0;
    return false;
  }
  budget.callsLeft -= n;
  return true;
}

export function targetSampleCount(range: HistoryRange): number {
  return bucketSpecForRange(range).count;
}

export function expectedRpcCallsForSampleCount(sampleCount: number): number {
  const searches = HISTORY_BINARY_SEARCH_MAX_ITER + 1;
  const multicallBatches = Math.ceil(sampleCount / HISTORY_MULTICALL_CHUNK);
  return searches + multicallBatches;
}

/** Binary-search aggregatorRoundId in one phase for the latest round with updatedAt <= targetSec. */
export async function findRoundAtOrBefore(
  fetch: FetchRoundData,
  budget: HistoryFetchBudget,
  phaseId: number,
  hiAggregatorRound: bigint,
  targetSec: number,
): Promise<bigint | null> {
  let lo = BigInt(1);
  let hi = hiAggregatorRound;
  let best: bigint | null = null;
  let iterations = 0;

  while (lo <= hi && !budgetExpired(budget) && iterations < HISTORY_BINARY_SEARCH_MAX_ITER) {
    iterations += 1;
    const mid = lo + (hi - lo) / BigInt(2);
    if (!consumeBudget(budget, 1)) break;
    const roundId = encodeRoundId(phaseId, mid);
    const row = await fetch(roundId);
    if (!row?.ok || row.updatedAt <= 0) {
      if (mid <= lo) break;
      hi = mid - BigInt(1);
      continue;
    }
    if (row.updatedAt <= targetSec) {
      best = roundId;
      lo = mid + BigInt(1);
    } else {
      if (mid <= lo) break;
      hi = mid - BigInt(1);
    }
  }
  return best;
}

/** Highest existing aggregatorRoundId in a phase (binary search on empties). */
export async function findPhaseHighRound(
  fetch: FetchRoundData,
  budget: HistoryFetchBudget,
  phaseId: number,
): Promise<bigint> {
  let lo = BigInt(1);
  let hi = BigInt(1);
  let expand = 0;
  while (!budgetExpired(budget) && expand < 20) {
    if (!consumeBudget(budget, 1)) break;
    const probe = encodeRoundId(phaseId, hi);
    const row = await fetch(probe);
    if (row?.ok && row.updatedAt > 0) {
      lo = hi;
      hi = hi * BigInt(2);
      expand += 1;
    } else {
      break;
    }
  }

  let left = lo;
  let right = hi;
  while (left < right && !budgetExpired(budget)) {
    const mid = left + (right - left + BigInt(1)) / BigInt(2);
    if (!consumeBudget(budget, 1)) break;
    const row = await fetch(encodeRoundId(phaseId, mid));
    if (row?.ok && row.updatedAt > 0) left = mid;
    else right = mid - BigInt(1);
  }
  return left;
}

export async function findRangeStartRoundId(
  fetch: FetchRoundData,
  budget: HistoryFetchBudget,
  latestRoundId: bigint,
  targetStartSec: number,
): Promise<bigint> {
  let { phaseId, aggregatorRoundId } = decodeRoundId(latestRoundId);

  while (!budgetExpired(budget)) {
    const candidate = await findRoundAtOrBefore(
      fetch,
      budget,
      phaseId,
      aggregatorRoundId,
      targetStartSec,
    );
    if (candidate) return candidate;

    if (phaseId <= 0) break;
    phaseId -= 1;
    aggregatorRoundId = await findPhaseHighRound(fetch, budget, phaseId);
    if (aggregatorRoundId <= BigInt(0)) break;
  }

  return encodeRoundId(0, BigInt(1));
}

export async function findEarliestRoundId(
  fetch: FetchRoundData,
  budget: HistoryFetchBudget,
  latestRoundId: bigint,
): Promise<bigint> {
  const { phaseId: latestPhase } = decodeRoundId(latestRoundId);
  let earliest = encodeRoundId(latestPhase, BigInt(1));

  for (let phase = 0; phase <= latestPhase && !budgetExpired(budget); phase++) {
    if (!consumeBudget(budget, 1)) break;
    const row = await fetch(encodeRoundId(phase, BigInt(1)));
    if (row?.ok && row.updatedAt > 0) {
      earliest = encodeRoundId(phase, BigInt(1));
    }
  }
  return earliest;
}

export function assignSamplesToBucketTimes(
  bucketStarts: number[],
  stepSec: number,
  rounds: RoundSample[],
): Array<{ t: number; answer: bigint }> {
  if (bucketStarts.length === 0) return [];
  const sorted = [...rounds].sort((a, b) => a.updatedAt - b.updatedAt);
  const out: Array<{ t: number; answer: bigint }> = [];

  for (const bucketStart of bucketStarts) {
    const bucketEnd = bucketStart + stepSec;
    let best: RoundSample | null = null;
    for (const r of sorted) {
      if (r.updatedAt <= bucketEnd) best = r;
      else break;
    }
    if (best) {
      out.push({ t: bucketStart, answer: best.answer });
    }
  }
  return out;
}

export function isHistoryPartial(
  bucketStarts: number[],
  filledCount: number,
  rangeFromSec: number,
  firstBucketSec: number | undefined,
): boolean {
  if (filledCount < bucketStarts.length) return true;
  if (firstBucketSec === undefined) return true;
  return firstBucketSec > rangeFromSec + 60;
}

export async function planSampleRoundIds(
  fetch: FetchRoundData,
  budget: HistoryFetchBudget,
  latestRoundId: bigint,
  bucketStarts: number[],
  rangeFromSec: number,
  useEarliestForAll: boolean,
): Promise<bigint[]> {
  const sampleCount = bucketStarts.length;
  let startId: bigint;

  if (useEarliestForAll) {
    startId = await findEarliestRoundId(fetch, budget, latestRoundId);
  } else {
    startId = await findRangeStartRoundId(
      fetch,
      budget,
      latestRoundId,
      rangeFromSec,
    );
  }

  return spaceSampleRoundIds(startId, latestRoundId, sampleCount);
}

export function estimateHistoryRpcCalls(sampleCount: number): number {
  return (
    1 +
    HISTORY_BINARY_SEARCH_MAX_ITER +
    Math.ceil(sampleCount / HISTORY_MULTICALL_CHUNK)
  );
}
