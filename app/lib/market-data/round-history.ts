import "server-only";

import { decodeRoundId, encodeRoundId } from "./round-id";

export const HISTORY_DEADLINE_MS = 8_000;
export const HISTORY_MAX_RPC_CALLS = 64;
export const HISTORY_MULTICALL_CHUNK = 32;
export const HISTORY_SAMPLE_MULTICALL_CHUNK = 64;
export const HISTORY_SEARCH_DEADLINE_RATIO = 0.5;
export const HISTORY_MAX_SEARCH_ITERATIONS = 8;
export const HISTORY_TIMELINE_PROBE_CAP = 160;
export const HISTORY_MAX_BUCKET_END_RESOLVES = 24;

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

/** Multicall-accelerated search within one aggregator phase. */
export async function findRoundAtOrBefore(
  batchFetch: BatchFetchRoundData,
  budget: HistoryFetchBudget,
  phaseId: number,
  hiAggregatorRound: bigint,
  targetSec: number,
  loAggregatorRound: bigint = BigInt(1),
): Promise<bigint | null> {
  let lo = loAggregatorRound;
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

/** Walks aggregator phases down to 1 for a global round at-or-before targetSec. */
export async function findRoundAtOrBeforeGlobal(
  batchFetch: BatchFetchRoundData,
  budget: HistoryFetchBudget,
  latestRoundId: bigint,
  targetSec: number,
): Promise<bigint | null> {
  let { phaseId, aggregatorRoundId } = decodeRoundId(latestRoundId);

  while (phaseId >= 1) {
    const candidate = await findRoundAtOrBefore(
      batchFetch,
      budget,
      phaseId,
      aggregatorRoundId,
      targetSec,
    );
    if (candidate) return candidate;

    if (phaseId <= 1) break;

    if (!searchPhaseExpired(budget) && consumeBudget(budget, 1)) {
      const first = (await batchFetch([encodeRoundId(phaseId, BigInt(1))]))[0];
      if (first?.ok && first.updatedAt > 0 && targetSec >= first.updatedAt) {
        break;
      }
    }

    phaseId -= 1;
    aggregatorRoundId = await findPhaseHighRound(batchFetch, budget, phaseId);
    if (aggregatorRoundId <= BigInt(0)) break;
  }

  return null;
}

export async function resolveGlobalFeedHistoryStart(
  batchFetch: BatchFetchRoundData,
  budget: HistoryFetchBudget,
  latestRoundId: bigint,
): Promise<{ historyStartSec: number; earliestRoundId: bigint } | null> {
  const latestPhase = decodeRoundId(latestRoundId).phaseId;
  const probes: bigint[] = [];
  for (let phase = 1; phase <= latestPhase; phase++) {
    probes.push(encodeRoundId(phase, BigInt(1)));
  }
  if (probes.length === 0) return null;
  if (!consumeBudget(budget, 1)) return null;

  const rows = await batchFetch(probes);
  let earliest: RoundSample | null = null;
  for (const row of rows) {
    if (!row.ok || row.updatedAt <= 0) continue;
    if (!earliest || row.updatedAt < earliest.updatedAt) {
      earliest = {
        roundId: row.roundId,
        updatedAt: row.updatedAt,
        answer: row.answer,
      };
    }
  }
  if (!earliest) return null;
  return {
    historyStartSec: earliest.updatedAt,
    earliestRoundId: earliest.roundId,
  };
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

export function windowTimelineProbeCount(
  fillableBucketCount: number,
  windowRoundSpan: bigint,
): number {
  const span = Number(windowRoundSpan > BigInt(Number.MAX_SAFE_INTEGER)
    ? BigInt(Number.MAX_SAFE_INTEGER)
    : windowRoundSpan);
  const byBuckets = Math.max(fillableBucketCount, 2);
  const bySpan = Math.max(Math.min(span + 1, byBuckets), 2);
  return Math.min(Math.max(byBuckets, bySpan), HISTORY_TIMELINE_PROBE_CAP);
}

export async function fetchWindowTimelineSamples(
  batchFetch: BatchFetchRoundData,
  budget: HistoryFetchBudget,
  windowStartRoundId: bigint,
  latestRoundId: bigint,
  fillableBucketCount: number,
): Promise<RoundSample[]> {
  const { phaseId: startPhase, aggregatorRoundId: startAgg } =
    decodeRoundId(windowStartRoundId);
  const { phaseId: endPhase, aggregatorRoundId: endAgg } =
    decodeRoundId(latestRoundId);

  if (startPhase === endPhase) {
    const span = endAgg - startAgg;
    const probeCount = windowTimelineProbeCount(fillableBucketCount, span);
    const planned = probeRoundIds(startPhase, startAgg, endAgg, probeCount);
    return fetchRoundIdList(batchFetch, budget, planned, [
      windowStartRoundId,
      latestRoundId,
    ]);
  }

  const phaseCount = endPhase - startPhase + 1;
  const probesPerPhase = Math.max(
    8,
    Math.floor(
      windowTimelineProbeCount(fillableBucketCount, endAgg - startAgg) /
        phaseCount,
    ),
  );
  const planned: bigint[] = [];
  for (let phase = startPhase; phase <= endPhase; phase++) {
    const lo = phase === startPhase ? startAgg : BigInt(1);
    let hi = endPhase === phase ? endAgg : await findPhaseHighRound(
      batchFetch,
      budget,
      phase,
    );
    if (hi < lo) hi = lo;
    planned.push(
      ...probeRoundIds(phase, lo, hi, probesPerPhase),
      encodeRoundId(phase, lo),
      encodeRoundId(phase, hi),
    );
  }
  return fetchRoundIdList(batchFetch, budget, planned, [
    windowStartRoundId,
    latestRoundId,
  ]);
}

async function fetchRoundIdList(
  batchFetch: BatchFetchRoundData,
  budget: HistoryFetchBudget,
  planned: bigint[],
  ensure: bigint[],
): Promise<RoundSample[]> {
  const seen = new Set(planned.map((id) => id.toString()));
  for (const id of ensure) {
    const key = id.toString();
    if (!seen.has(key)) {
      seen.add(key);
      planned.push(id);
    }
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

function fillableBucketEnds(
  bucketStarts: number[],
  stepSec: number,
  historyStartSec: number,
): number[] {
  return bucketStarts
    .map((start) => start + stepSec)
    .filter((end) => end > historyStartSec);
}

export async function resolveBucketEndRounds(
  batchFetch: BatchFetchRoundData,
  budget: HistoryFetchBudget,
  latestRoundId: bigint,
  bucketEnds: number[],
  timeline: RoundSample[],
): Promise<RoundSample[]> {
  const merged = new Map<string, RoundSample>();
  for (const row of timeline) {
    merged.set(row.roundId.toString(), row);
  }

  let resolved = 0;
  for (const bucketEnd of bucketEnds) {
    if (resolved >= HISTORY_MAX_BUCKET_END_RESOLVES) break;
    if (searchPhaseExpired(budget)) break;

    const pick = pickRoundAtOrBeforeTime(
      [...merged.values()].sort((a, b) => a.updatedAt - b.updatedAt),
      bucketEnd,
    );
    const sorted = [...merged.values()].sort((a, b) => a.updatedAt - b.updatedAt);
    const pickIdx = pick
      ? sorted.findIndex((r) => r.roundId === pick.roundId)
      : -1;
    const next = pickIdx >= 0 ? sorted[pickIdx + 1] : sorted[0];
    const gapOk =
      pick &&
      (!next ||
        next.updatedAt > bucketEnd ||
        next.updatedAt - pick.updatedAt <= 900);
    if (gapOk && pick) continue;

    const roundId = await findRoundAtOrBeforeGlobal(
      batchFetch,
      budget,
      latestRoundId,
      bucketEnd,
    );
    if (!roundId) continue;
    if (merged.has(roundId.toString())) continue;
    if (!consumeBudget(budget, 1)) break;
    const row = (await batchFetch([roundId]))[0];
    if (!row?.ok || row.updatedAt <= 0) continue;
    merged.set(roundId.toString(), {
      roundId: row.roundId,
      updatedAt: row.updatedAt,
      answer: row.answer,
    });
    resolved += 1;
  }

  return [...merged.values()].sort((a, b) => a.updatedAt - b.updatedAt);
}

export interface BucketAssignment {
  t: number;
  answer: bigint;
  source: RoundSample;
}

export function assignSamplesToBucketTimes(
  bucketStarts: number[],
  stepSec: number,
  rounds: RoundSample[],
  historyStartSec?: number,
): BucketAssignment[] {
  if (bucketStarts.length === 0) return [];
  const sorted = [...rounds].sort((a, b) => a.updatedAt - b.updatedAt);
  const out: BucketAssignment[] = [];
  let carry: RoundSample | null = null;

  for (const bucketStart of bucketStarts) {
    const bucketEnd = bucketStart + stepSec;
    if (historyStartSec !== undefined && bucketEnd <= historyStartSec) {
      continue;
    }
    const pick = pickRoundAtOrBeforeTime(sorted, bucketEnd);
    if (pick) {
      carry = pick;
      out.push({ t: bucketStart, answer: pick.answer, source: pick });
    } else if (carry) {
      out.push({ t: bucketStart, answer: carry.answer, source: carry });
    } else if (sorted.length > 0) {
      carry = sorted[0];
      out.push({ t: bucketStart, answer: sorted[0].answer, source: sorted[0] });
    }
  }
  return out;
}

export function hasStaleCarryForwardPartial(
  assignments: BucketAssignment[],
  timeline: RoundSample[],
  stepSec: number,
): boolean {
  if (assignments.length === 0) return false;
  const sorted = [...timeline].sort((a, b) => a.updatedAt - b.updatedAt);
  let streak = 0;
  let streakStart = 0;

  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i];
    const carried = a.source.updatedAt < a.t;
    const sameAsPrev =
      i > 0 && assignments[i - 1].source.roundId === a.source.roundId;

    if (carried && sameAsPrev) {
      streak += 1;
    } else if (carried) {
      streak = 1;
      streakStart = i;
    } else {
      streak = 0;
    }

    if (streak <= 2) continue;

    const bucketEnd = a.t + stepSec;
    const sourceUpdatedAt = assignments[streakStart].source.updatedAt;
    const hasIntermediateUpdate = sorted.some(
      (r) =>
        r.updatedAt > sourceUpdatedAt &&
        r.updatedAt <= bucketEnd &&
        r.roundId !== a.source.roundId,
    );
    if (hasIntermediateUpdate) return true;
  }
  return false;
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
  carryPartial: boolean,
): boolean {
  if (carryPartial) return true;
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

export async function findRangeStartRoundId(
  batchFetch: BatchFetchRoundData,
  budget: HistoryFetchBudget,
  latestRoundId: bigint,
  targetStartSec: number,
): Promise<bigint> {
  const hit = await findRoundAtOrBeforeGlobal(
    batchFetch,
    budget,
    latestRoundId,
    targetStartSec,
  );
  if (hit) return hit;
  const global = await resolveGlobalFeedHistoryStart(
    batchFetch,
    budget,
    latestRoundId,
  );
  return global?.earliestRoundId ?? encodeRoundId(1, BigInt(1));
}

export async function findEarliestRoundId(
  batchFetch: BatchFetchRoundData,
  budget: HistoryFetchBudget,
  latestRoundId: bigint,
): Promise<bigint> {
  const global = await resolveGlobalFeedHistoryStart(
    batchFetch,
    budget,
    latestRoundId,
  );
  return global?.earliestRoundId ?? latestRoundId;
}

export function estimateHistoryRpcCalls(sampleCount: number): number {
  const fillable = Math.max(sampleCount, 2);
  const probes = Math.min(Math.max(fillable, 64), HISTORY_TIMELINE_PROBE_CAP);
  return (
    1 +
    1 +
    3 +
    Math.ceil(probes / HISTORY_SAMPLE_MULTICALL_CHUNK) +
    2
  );
}

export async function buildHistorySamples(
  batchFetch: BatchFetchRoundData,
  budget: HistoryFetchBudget,
  latestRoundId: bigint,
  bucketStarts: number[],
  stepSec: number,
  rangeFromSec: number,
  useFeedInception: boolean,
  knownGlobalStart?: { historyStartSec: number; earliestRoundId: bigint },
): Promise<{
  samples: Array<{ t: number; answer: bigint }>;
  partial: boolean;
  historyStartSec?: number;
  rpcCalls: number;
}> {
  const initialCalls = budget.callsLeft;

  const globalStart =
    knownGlobalStart ??
    (await resolveGlobalFeedHistoryStart(batchFetch, budget, latestRoundId));
  if (!globalStart) {
    return {
      samples: [],
      partial: true,
      rpcCalls: rpcCallsUsed(budget, initialCalls),
    };
  }

  const { historyStartSec, earliestRoundId } = globalStart;
  const windowTargetSec = useFeedInception
    ? rangeFromSec
    : Math.max(rangeFromSec, historyStartSec);

  const windowStartRound =
    (await findRoundAtOrBeforeGlobal(
      batchFetch,
      budget,
      latestRoundId,
      windowTargetSec,
    )) ?? earliestRoundId;

  const fillable = fillableBucketCount(
    bucketStarts,
    stepSec,
    historyStartSec,
  );

  let timeline = await fetchWindowTimelineSamples(
    batchFetch,
    budget,
    windowStartRound,
    latestRoundId,
    fillable,
  );

  const bucketEnds = fillableBucketEnds(
    bucketStarts,
    stepSec,
    historyStartSec,
  );
  timeline = await resolveBucketEndRounds(
    batchFetch,
    budget,
    latestRoundId,
    bucketEnds,
    timeline,
  );

  const assignments = assignSamplesToBucketTimes(
    bucketStarts,
    stepSec,
    timeline,
    historyStartSec,
  );
  const carryPartial = hasStaleCarryForwardPartial(
    assignments,
    timeline,
    stepSec,
  );
  const partial = isHistoryPartial(
    bucketStarts,
    stepSec,
    assignments.length,
    rangeFromSec,
    historyStartSec,
    carryPartial,
  );

  return {
    samples: assignments.map((a) => ({ t: a.t, answer: a.answer })),
    partial,
    historyStartSec,
    rpcCalls: rpcCallsUsed(budget, initialCalls),
  };
}
