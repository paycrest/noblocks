import "server-only";

import type { HistoryRange } from "./types";
import { bucketSpecForRange } from "./series";
import { decodeRoundId, encodeRoundId, spaceSampleRoundIds } from "./round-id";

export const HISTORY_DEADLINE_MS = 8_000;
export const HISTORY_MAX_RPC_CALLS = 64;
export const HISTORY_MULTICALL_CHUNK = 32;
/** Wider batches when sampling buckets (search stays at 32 probes). */
export const HISTORY_SAMPLE_MULTICALL_CHUNK = 64;
export const HISTORY_SEARCH_DEADLINE_RATIO = 0.5;
export const HISTORY_MAX_SEARCH_ITERATIONS = 8;
/** RoundId probes spanning first→latest for time-based bucket assignment. */
export const HISTORY_TIMELINE_PROBE_COUNT = 160;
export const HISTORY_MAX_BUCKET_REFINEMENTS = 12;

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

export type BatchFetchRoundData = (
  roundIds: bigint[],
) => Promise<RoundDataResult[]>;

export interface HistoryFetchBudget {
  deadlineAtMs: number;
  searchDeadlineAtMs: number;
  callsLeft: number;
}

export function createHistoryBudget(
  deadlineMs = HISTORY_DEADLINE_MS,
): HistoryFetchBudget {
  const now = Date.now();
  return {
    deadlineAtMs: now + deadlineMs,
    searchDeadlineAtMs:
      now + Math.floor(deadlineMs * HISTORY_SEARCH_DEADLINE_RATIO),
    callsLeft: HISTORY_MAX_RPC_CALLS,
  };
}

export function budgetExpired(budget: HistoryFetchBudget): boolean {
  return Date.now() >= budget.deadlineAtMs || budget.callsLeft <= 0;
}

export function searchPhaseExpired(budget: HistoryFetchBudget): boolean {
  return Date.now() >= budget.searchDeadlineAtMs || budget.callsLeft <= 0;
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

export function rpcCallsUsed(budget: HistoryFetchBudget, initial: number): number {
  return initial - budget.callsLeft;
}

export function targetSampleCount(range: HistoryRange): number {
  return bucketSpecForRange(range).count;
}

export function probeRoundIds(
  phaseId: number,
  lo: bigint,
  hi: bigint,
  count: number,
): bigint[] {
  if (hi < lo) return [];
  if (lo === hi) return [encodeRoundId(phaseId, lo)];
  const seen = new Set<string>();
  const out: bigint[] = [];
  const steps = Math.max(2, count);
  for (let i = 0; i < steps; i++) {
    const agg =
      lo + ((hi - lo) * BigInt(i)) / BigInt(steps - 1);
    const id = encodeRoundId(phaseId, agg);
    const key = id.toString();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(id);
    }
  }
  return out;
}

/** Multicall-accelerated search for latest round with updatedAt <= targetSec. */
export async function findRoundAtOrBefore(
  batchFetch: BatchFetchRoundData,
  budget: HistoryFetchBudget,
  phaseId: number,
  hiAggregatorRound: bigint,
  targetSec: number,
): Promise<bigint | null> {
  let lo = BigInt(1);
  let hi = hiAggregatorRound;
  let best: bigint | null = null;
  let iterations = 0;

  while (
    lo <= hi &&
    !searchPhaseExpired(budget) &&
    iterations < HISTORY_MAX_SEARCH_ITERATIONS
  ) {
    iterations += 1;
    if (!consumeBudget(budget, 1)) break;

    const probes = probeRoundIds(phaseId, lo, hi, HISTORY_MULTICALL_CHUNK);
    const rows = (await batchFetch(probes)).filter(
      (r) => r.ok && r.updatedAt > 0,
    );
    if (rows.length === 0) break;

    for (const row of rows) {
      const { aggregatorRoundId } = decodeRoundId(row.roundId);
      if (row.updatedAt <= targetSec) {
        if (
          !best ||
          decodeRoundId(best).aggregatorRoundId < aggregatorRoundId
        ) {
          best = row.roundId;
        }
      }
    }

    const before = rows.filter((r) => r.updatedAt <= targetSec);
    const after = rows.filter((r) => r.updatedAt > targetSec);

    if (before.length > 0 && after.length === 0) {
      const maxAgg = before.reduce(
        (m, r) =>
          decodeRoundId(r.roundId).aggregatorRoundId > m
            ? decodeRoundId(r.roundId).aggregatorRoundId
            : m,
        BigInt(0),
      );
      lo = maxAgg + BigInt(1);
      continue;
    }

    if (after.length > 0 && before.length === 0) {
      const minAgg = after.reduce(
        (m, r) =>
          decodeRoundId(r.roundId).aggregatorRoundId < m
            ? decodeRoundId(r.roundId).aggregatorRoundId
            : m,
        hi,
      );
      hi = minAgg - BigInt(1);
      continue;
    }

    if (before.length > 0) {
      const maxAgg = before.reduce(
        (m, r) =>
          decodeRoundId(r.roundId).aggregatorRoundId > m
            ? decodeRoundId(r.roundId).aggregatorRoundId
            : m,
        BigInt(0),
      );
      lo = maxAgg + BigInt(1);
    }
    if (after.length > 0) {
      const minAgg = after.reduce(
        (m, r) =>
          decodeRoundId(r.roundId).aggregatorRoundId < m
            ? decodeRoundId(r.roundId).aggregatorRoundId
            : m,
        hi,
      );
      hi = minAgg - BigInt(1);
    }

    if (hi - lo <= BigInt(2)) break;
  }

  return best;
}

export async function findPhaseHighRound(
  batchFetch: BatchFetchRoundData,
  budget: HistoryFetchBudget,
  phaseId: number,
): Promise<bigint> {
  let lo = BigInt(1);
  let hi = BigInt(1);

  if (!searchPhaseExpired(budget) && consumeBudget(budget, 1)) {
    const row = (await batchFetch([encodeRoundId(phaseId, hi)]))[0];
    if (!row?.ok) return BigInt(1);
  }

  while (!searchPhaseExpired(budget)) {
    if (!consumeBudget(budget, 1)) break;
    const probe = encodeRoundId(phaseId, hi * BigInt(2));
    const row = (await batchFetch([probe]))[0];
    if (row?.ok && row.updatedAt > 0) {
      lo = hi;
      hi = hi * BigInt(2);
    } else {
      break;
    }
  }

  while (lo < hi && !searchPhaseExpired(budget)) {
    if (!consumeBudget(budget, 1)) break;
    const probes = probeRoundIds(phaseId, lo, hi, HISTORY_MULTICALL_CHUNK);
    const rows = (await batchFetch(probes)).filter(
      (r) => r.ok && r.updatedAt > 0,
    );
    if (rows.length === 0) break;
    const maxAgg = rows.reduce(
      (m, r) =>
        decodeRoundId(r.roundId).aggregatorRoundId > m
          ? decodeRoundId(r.roundId).aggregatorRoundId
          : m,
      lo,
    );
    if (maxAgg >= hi) break;
    lo = maxAgg;
  }

  return lo;
}

export async function findRangeStartRoundId(
  batchFetch: BatchFetchRoundData,
  budget: HistoryFetchBudget,
  latestRoundId: bigint,
  targetStartSec: number,
): Promise<bigint> {
  let { phaseId, aggregatorRoundId } = decodeRoundId(latestRoundId);

  while (!searchPhaseExpired(budget)) {
    const candidate = await findRoundAtOrBefore(
      batchFetch,
      budget,
      phaseId,
      aggregatorRoundId,
      targetStartSec,
    );
    if (candidate) return candidate;

    if (phaseId <= 0) break;
    phaseId -= 1;
    aggregatorRoundId = await findPhaseHighRound(batchFetch, budget, phaseId);
    if (aggregatorRoundId <= BigInt(0)) break;
  }

  return encodeRoundId(
    Math.max(0, decodeRoundId(latestRoundId).phaseId),
    BigInt(1),
  );
}

export function firstRoundIdForLatest(latestRoundId: bigint): bigint {
  const { phaseId } = decodeRoundId(latestRoundId);
  return encodeRoundId(phaseId, BigInt(1));
}

export async function resolveFeedHistoryStart(
  batchFetch: BatchFetchRoundData,
  budget: HistoryFetchBudget,
  latestRoundId: bigint,
): Promise<{ firstRoundId: bigint; historyStartSec: number } | null> {
  const firstRoundId = firstRoundIdForLatest(latestRoundId);
  if (!consumeBudget(budget, 1)) return null;
  const row = (await batchFetch([firstRoundId]))[0];
  if (!row?.ok || row.updatedAt <= 0) return null;
  return { firstRoundId, historyStartSec: row.updatedAt };
}

export function pickRoundAtOrBeforeTime(
  timeline: RoundSample[],
  targetSec: number,
): RoundSample | null {
  if (timeline.length === 0) return null;
  let lo = 0;
  let hi = timeline.length - 1;
  let best: RoundSample | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (timeline[mid].updatedAt <= targetSec) {
      best = timeline[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

export function timelineProbeCount(bucketCount: number): number {
  return Math.min(
    Math.max(bucketCount, 64),
    HISTORY_TIMELINE_PROBE_COUNT,
  );
}

export async function fetchTimelineSamples(
  batchFetch: BatchFetchRoundData,
  budget: HistoryFetchBudget,
  firstRoundId: bigint,
  latestRoundId: bigint,
  bucketCount: number,
): Promise<RoundSample[]> {
  const probeCount = timelineProbeCount(bucketCount);
  const planned = spaceSampleRoundIds(firstRoundId, latestRoundId, probeCount);
  const seen = new Set(planned.map((id) => id.toString()));
  if (!seen.has(latestRoundId.toString())) {
    planned.push(latestRoundId);
  }
  if (!seen.has(firstRoundId.toString())) {
    planned.unshift(firstRoundId);
  }

  const rounds: RoundSample[] = [];
  for (let i = 0; i < planned.length; i += HISTORY_SAMPLE_MULTICALL_CHUNK) {
    if (budgetExpired(budget)) break;
    if (!consumeBudget(budget, 1)) break;
    const chunk = planned.slice(i, i + HISTORY_SAMPLE_MULTICALL_CHUNK);
    const rows = await batchFetch(chunk);
    for (const row of rows) {
      if (!row.ok || row.updatedAt <= 0) continue;
      rounds.push({
        roundId: row.roundId,
        updatedAt: row.updatedAt,
        answer: row.answer,
      });
    }
  }

  return rounds.sort((a, b) => a.updatedAt - b.updatedAt);
}

function bucketEndsNeedingRefinement(
  bucketStarts: number[],
  stepSec: number,
  historyStartSec: number,
  timeline: RoundSample[],
): number[] {
  if (timeline.length < 2) return [];
  const out: number[] = [];
  for (const bucketStart of bucketStarts) {
    const bucketEnd = bucketStart + stepSec;
    if (bucketEnd <= historyStartSec) continue;
    const pick = pickRoundAtOrBeforeTime(timeline, bucketEnd);
    if (!pick) {
      out.push(bucketEnd);
      continue;
    }
    const pickIdx = timeline.findIndex(
      (r) => r.roundId === pick.roundId && r.updatedAt === pick.updatedAt,
    );
    const next = pickIdx >= 0 ? timeline[pickIdx + 1] : undefined;
    if (
      next &&
      bucketEnd > pick.updatedAt &&
      bucketEnd < next.updatedAt &&
      next.updatedAt - pick.updatedAt > stepSec
    ) {
      out.push(bucketEnd);
    }
  }
  return [...new Set(out)];
}

export async function refineTimelineForBucketEnds(
  batchFetch: BatchFetchRoundData,
  budget: HistoryFetchBudget,
  latestRoundId: bigint,
  timeline: RoundSample[],
  bucketEnds: number[],
): Promise<RoundSample[]> {
  const { phaseId, aggregatorRoundId: latestAgg } =
    decodeRoundId(latestRoundId);
  const extra: RoundSample[] = [];
  let refined = 0;

  for (const bucketEnd of bucketEnds) {
    if (refined >= HISTORY_MAX_BUCKET_REFINEMENTS) break;
    if (searchPhaseExpired(budget)) break;

    const before = pickRoundAtOrBeforeTime(timeline, bucketEnd);
    const afterIdx =
      before === null
        ? 0
        : timeline.findIndex((r) => r.roundId === before.roundId) + 1;
    const after = timeline[afterIdx];
    const lo = before
      ? decodeRoundId(before.roundId).aggregatorRoundId
      : BigInt(1);
    const hi = after
      ? decodeRoundId(after.roundId).aggregatorRoundId
      : latestAgg;

    const roundId = await findRoundAtOrBefore(
      batchFetch,
      budget,
      phaseId,
      hi,
      bucketEnd,
    );
    if (!roundId) continue;
    if (before && roundId === before.roundId) continue;

    if (!consumeBudget(budget, 1)) break;
    const row = (await batchFetch([roundId]))[0];
    if (!row?.ok || row.updatedAt <= 0) continue;
    extra.push({
      roundId: row.roundId,
      updatedAt: row.updatedAt,
      answer: row.answer,
    });
    refined += 1;
    if (lo >= hi) continue;
  }

  return extra;
}

export async function findEarliestRoundId(
  batchFetch: BatchFetchRoundData,
  budget: HistoryFetchBudget,
  latestRoundId: bigint,
): Promise<bigint> {
  const { phaseId: latestPhase } = decodeRoundId(latestRoundId);
  const probes: bigint[] = [];
  for (let phase = 0; phase <= latestPhase; phase++) {
    probes.push(encodeRoundId(phase, BigInt(1)));
  }
  if (probes.length === 0) return latestRoundId;

  if (!searchPhaseExpired(budget) && consumeBudget(budget, 1)) {
    const rows = await batchFetch(probes);
    for (let phase = 0; phase <= latestPhase; phase++) {
      const row = rows.find(
        (r) => decodeRoundId(r.roundId).phaseId === phase && r.ok,
      );
      if (row?.updatedAt) {
        return encodeRoundId(phase, BigInt(1));
      }
    }
  }
  return encodeRoundId(latestPhase, BigInt(1));
}

export function assignSamplesToBucketTimes(
  bucketStarts: number[],
  stepSec: number,
  rounds: RoundSample[],
  historyStartSec?: number,
): Array<{ t: number; answer: bigint }> {
  if (bucketStarts.length === 0) return [];
  const sorted = [...rounds].sort((a, b) => a.updatedAt - b.updatedAt);
  const out: Array<{ t: number; answer: bigint }> = [];
  let carry: RoundSample | null = null;

  for (const bucketStart of bucketStarts) {
    const bucketEnd = bucketStart + stepSec;
    if (historyStartSec !== undefined && bucketEnd <= historyStartSec) {
      continue;
    }
    const pick = pickRoundAtOrBeforeTime(sorted, bucketEnd);
    if (pick) {
      carry = pick;
      out.push({ t: bucketStart, answer: pick.answer });
    } else if (carry) {
      out.push({ t: bucketStart, answer: carry.answer });
    } else if (sorted.length > 0) {
      carry = sorted[0];
      out.push({ t: bucketStart, answer: sorted[0].answer });
    }
  }
  return out;
}

export function fillableBucketCount(
  bucketStarts: number[],
  stepSec: number,
  historyStartSec: number,
): number {
  return bucketStarts.filter((t) => t + stepSec > historyStartSec).length;
}

export function isHistoryPartial(
  bucketStarts: number[],
  stepSec: number,
  filledCount: number,
  rangeFromSec: number,
  historyStartSec: number | undefined,
): boolean {
  if (historyStartSec !== undefined && rangeFromSec + 60 < historyStartSec) {
    return true;
  }
  if (historyStartSec === undefined) {
    return filledCount < bucketStarts.length;
  }
  const fillable = fillableBucketCount(
    bucketStarts,
    stepSec,
    historyStartSec,
  );
  return filledCount < fillable;
}

export async function planSampleRoundIds(
  batchFetch: BatchFetchRoundData,
  budget: HistoryFetchBudget,
  latestRoundId: bigint,
  bucketStarts: number[],
  rangeFromSec: number,
  useEarliestForAll: boolean,
): Promise<bigint[]> {
  const sampleCount = bucketStarts.length;
  let startId: bigint;

  if (useEarliestForAll) {
    startId = await findEarliestRoundId(batchFetch, budget, latestRoundId);
  } else {
    startId = await findRangeStartRoundId(
      batchFetch,
      budget,
      latestRoundId,
      rangeFromSec,
    );
  }

  return spaceSampleRoundIds(startId, latestRoundId, sampleCount);
}

export function estimateHistoryRpcCalls(sampleCount: number): number {
  const probes = timelineProbeCount(sampleCount);
  return (
    1 +
    1 +
    Math.ceil(probes / HISTORY_SAMPLE_MULTICALL_CHUNK) +
    3
  );
}

export async function buildHistorySamples(
  batchFetch: BatchFetchRoundData,
  budget: HistoryFetchBudget,
  latestRoundId: bigint,
  bucketStarts: number[],
  stepSec: number,
  rangeFromSec: number,
  _useEarliestForAll: boolean,
  knownFeedStart?: { firstRoundId: bigint; historyStartSec: number },
): Promise<{
  samples: Array<{ t: number; answer: bigint }>;
  partial: boolean;
  historyStartSec?: number;
  rpcCalls: number;
}> {
  const initialCalls = budget.callsLeft;

  const feedStart =
    knownFeedStart ??
    (await resolveFeedHistoryStart(batchFetch, budget, latestRoundId));
  if (!feedStart) {
    return { samples: [], partial: true, rpcCalls: rpcCallsUsed(budget, initialCalls) };
  }

  const { firstRoundId, historyStartSec } = feedStart;

  let timeline = await fetchTimelineSamples(
    batchFetch,
    budget,
    firstRoundId,
    latestRoundId,
    bucketStarts.length,
  );

  const refineEnds = bucketEndsNeedingRefinement(
    bucketStarts,
    stepSec,
    historyStartSec,
    timeline,
  );
  if (refineEnds.length > 0) {
    const extra = await refineTimelineForBucketEnds(
      batchFetch,
      budget,
      latestRoundId,
      timeline,
      refineEnds,
    );
    if (extra.length > 0) {
      timeline = [...timeline, ...extra].sort(
        (a, b) => a.updatedAt - b.updatedAt,
      );
    }
  }

  const mapped = assignSamplesToBucketTimes(
    bucketStarts,
    stepSec,
    timeline,
    historyStartSec,
  );
  const partial = isHistoryPartial(
    bucketStarts,
    stepSec,
    mapped.length,
    rangeFromSec,
    historyStartSec,
  );

  return {
    samples: mapped,
    partial,
    historyStartSec,
    rpcCalls: rpcCallsUsed(budget, initialCalls),
  };
}
