import "server-only";

import { parseAbi, type PublicClient } from "viem";
import type { ChainlinkFeedConfig } from "./types";
import { bucketLabelTimestamp } from "./series";
import { decodeRoundId, encodeRoundId } from "./round-id";
import {
  answerToDecimalString,
  isStablecoinBandOk,
  validatePositiveAnswer,
} from "./validate";

export const HISTORY_DEADLINE_MS = 8_000;
export const HISTORY_BACKFILL_DEADLINE_MS = 60_000;
export const HISTORY_KARY_PROBES = 8;
export const HISTORY_MULTICALL_CHUNK = 256;
export const HISTORY_FALLBACK_MULTICALL_CHUNK = 64;
export const HISTORY_PROBE_CONCURRENCY = 3;
export const PHASE_TABLE_TTL_MS = 60 * 60 * 1000;
export const PHASE_TABLE_HTTP_CALLS = 3;

const proxyAbi = parseAbi([
  "function phaseId() view returns (uint16)",
  "function phaseAggregators(uint16 phaseId) view returns (address)",
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function getRoundData(uint80 roundId) view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() view returns (uint8)",
  "function description() view returns (string)",
]);

const aggregatorAbi = parseAbi([
  "function latestRound() view returns (uint256)",
]);

export class HistoryDeadlineError extends Error {
  constructor() {
    super("history_deadline_exceeded");
    this.name = "HistoryDeadlineError";
  }
}

export interface PhaseTableRow {
  phaseId: number;
  firstTs: number;
  lastTs: number;
  lastRound: bigint;
}

export interface RoundProbe {
  roundId: bigint;
  updatedAt: number;
  answer: bigint;
  ok: boolean;
}

export interface HistoryTarget {
  bucketStart: number;
  bucketEnd: number;
  phaseId: number;
  lo: bigint;
  hi: bigint;
  done: boolean;
  answer: bigint;
  bestUpdatedAt: number;
  phaseLastRound: bigint;
  bestRoundAgg: bigint;
  proven: boolean;
  widenSteps: number;
}

export interface HistoryResolveResult {
  samples: Array<{
    t: number;
    bucketStart: number;
    answer: bigint;
    answerUpdatedAt: number;
  }>;
  partial: boolean;
  historyStartSec: number;
  rpcCalls: number;
}

interface CachedPhaseBundle {
  rows: PhaseTableRow[];
  historyStartSec: number;
  fetchedAt: number;
  latestPhaseId: number;
  indexes: Map<number, PhaseRoundIndex>;
}

const phaseBundleCache = new Map<string, CachedPhaseBundle>();
const phaseBundleInFlight = new Map<string, Promise<CachedPhaseBundle>>();
const phaseIndexCache = new Map<string, PhaseRoundIndex>();

export type HistoryChainClient = Pick<
  PublicClient,
  "multicall" | "readContract"
>;

export function resetPhaseTableCacheForTests(): void {
  phaseBundleCache.clear();
  phaseBundleInFlight.clear();
  phaseIndexCache.clear();
}

function phaseIndexCacheKey(feedKey: string, phaseId: number): string {
  return `${feedKey}:p${phaseId}`;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const i = nextIndex;
        nextIndex += 1;
        if (i >= items.length) break;
        results[i] = await fn(items[i], i);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export const PHASE_INDEX_SAMPLES = 2048;
export const CLOSED_PHASE_INDEX_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const HISTORY_SEARCH_MAX_ITERATIONS = 4;

export interface PhaseRoundIndexPoint {
  round: bigint;
  updatedAt: number;
}

export interface PhaseRoundIndex {
  phaseId: number;
  points: PhaseRoundIndexPoint[];
  closed: boolean;
  fetchedAt: number;
}

export function historyDeadlineMs(
  stepSec: number,
  specCount: number,
  range?: import("./types").HistoryRange,
): number {
  if (range === "1Y" || range === "ALL") return 20_000;
  if (stepSec >= 7 * 86400) return 20_000;
  if (stepSec >= 86400 && specCount >= 120) return 20_000;
  return HISTORY_DEADLINE_MS;
}

export function acceptanceSlopSec(
  stepSec: number,
  feedHeartbeatSec: number,
): number {
  return Math.min(Math.floor(stepSec / 4), feedHeartbeatSec);
}

export function sampleRoundIdsForIndex(
  phaseId: number,
  lastRound: bigint,
): bigint[] {
  const last = Number(lastRound);
  if (!Number.isFinite(last) || last <= 1) {
    return [encodeRoundId(phaseId, BigInt(1))];
  }
  const out: bigint[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < PHASE_INDEX_SAMPLES; i++) {
    const agg =
      BigInt(1) +
      (BigInt(last - 1) * BigInt(i)) / BigInt(PHASE_INDEX_SAMPLES - 1);
    const id = encodeRoundId(phaseId, agg);
    const key = id.toString();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(id);
    }
  }
  return out;
}

export function bracketIntervalForBucketEnd(
  index: PhaseRoundIndex,
  phase: PhaseTableRow,
  bucketEnd: number,
): { lo: bigint; hi: bigint } {
  const pts = index.points;
  if (pts.length === 0) {
    return { lo: BigInt(1), hi: phase.lastRound };
  }
  let loIdx = 0;
  for (let i = 0; i < pts.length; i++) {
    if (pts[i].updatedAt <= bucketEnd) loIdx = i;
  }
  const lo = pts[loIdx].round;
  let hi =
    loIdx + 1 < pts.length ? pts[loIdx + 1].round : phase.lastRound;
  if (hi < lo) hi = lo;
  if (hi > phase.lastRound) hi = phase.lastRound;
  if (lo < BigInt(1)) return { lo: BigInt(1), hi };
  return { lo, hi };
}

export function probeCountForInterval(lo: bigint, hi: bigint): number {
  const width = Number(hi - lo + BigInt(1));
  if (!Number.isFinite(width) || width <= 0) return 2;
  return Math.min(HISTORY_KARY_PROBES, Math.max(2, width));
}

export function karySearchIterations(maxLastRound: bigint): number {
  void maxLastRound;
  return HISTORY_SEARCH_MAX_ITERATIONS;
}

export function isTargetIntervalUnresolved(target: HistoryTarget): boolean {
  return target.hi - target.lo > BigInt(1);
}

export function isRangeBeforeHistoryStart(
  rangeFromSec: number,
  historyStartSec: number,
  stepSec: number,
): boolean {
  return rangeFromSec + stepSec < historyStartSec;
}

export function pickPhaseForTimestamp(
  targetSec: number,
  phases: PhaseTableRow[],
): PhaseTableRow | null {
  let best: PhaseTableRow | null = null;
  const sorted = [...phases].sort((a, b) => a.firstTs - b.firstTs);
  for (const row of sorted) {
    if (row.firstTs <= targetSec) best = row;
  }
  return best;
}

export function probeAggregatorRounds(
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
    const agg = lo + ((hi - lo) * BigInt(i)) / BigInt(steps - 1);
    const id = encodeRoundId(phaseId, agg);
    const key = id.toString();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(id);
    }
  }
  return out;
}

export function narrowTargetInterval(
  target: HistoryTarget,
  probes: Map<string, RoundProbe>,
): void {
  const rows: RoundProbe[] = [];
  for (const row of probes.values()) {
    if (!row.ok || row.updatedAt <= 0) continue;
    const { phaseId, aggregatorRoundId } = decodeRoundId(row.roundId);
    if (phaseId !== target.phaseId) continue;
    if (aggregatorRoundId < target.lo || aggregatorRoundId > target.hi) {
      continue;
    }
    rows.push(row);
  }
  if (rows.length === 0) return;

  const before = rows.filter((r) => r.updatedAt <= target.bucketEnd);
  const after = rows.filter((r) => r.updatedAt > target.bucketEnd);

  if (before.length > 0) {
    const maxAgg = before.reduce(
      (m, r) =>
        decodeRoundId(r.roundId).aggregatorRoundId > m
          ? decodeRoundId(r.roundId).aggregatorRoundId
          : m,
      BigInt(0),
    );
    let best = before[0];
    for (const r of before) {
      if (
        decodeRoundId(r.roundId).aggregatorRoundId === maxAgg &&
        r.updatedAt >= best.updatedAt
      ) {
        best = r;
      }
    }
    target.answer = best.answer;
    target.bestUpdatedAt = best.updatedAt;
    target.bestRoundAgg = maxAgg;
    target.lo = maxAgg + BigInt(1);
  }

  if (after.length > 0) {
    const minAgg = after.reduce(
      (m, r) =>
        decodeRoundId(r.roundId).aggregatorRoundId < m
          ? decodeRoundId(r.roundId).aggregatorRoundId
          : m,
      target.hi,
    );
    target.hi = minAgg - BigInt(1);
  }
}

export function expandTargetInterval(
  target: HistoryTarget,
  index: PhaseRoundIndex,
  phase: PhaseTableRow,
): void {
  const bracket = bracketIntervalForBucketEnd(index, phase, target.bucketEnd);
  const width =
    bracket.hi >= bracket.lo ? bracket.hi - bracket.lo : BigInt(64);
  const pad = width > BigInt(0) ? width : BigInt(64);
  const extra = pad * BigInt(1 + target.widenSteps);
  target.lo = bracket.lo > extra ? bracket.lo - extra : BigInt(1);
  target.hi =
    bracket.hi + extra > phase.lastRound ? phase.lastRound : bracket.hi + extra;
  target.widenSteps += 1;
  target.proven = false;
  target.done = false;
  target.answer = BigInt(0);
  target.bestUpdatedAt = 0;
  target.bestRoundAgg = BigInt(0);
}

export function pickBestAtOrBefore(
  target: HistoryTarget,
  probes: Map<string, RoundProbe>,
  scanLo?: bigint,
  scanHi?: bigint,
): void {
  const lo = scanLo ?? target.lo;
  const hi = scanHi ?? target.hi;
  let best: RoundProbe | null = null;
  for (const row of probes.values()) {
    if (!row.ok || row.updatedAt <= 0 || row.updatedAt > target.bucketEnd) {
      continue;
    }
    const { phaseId, aggregatorRoundId } = decodeRoundId(row.roundId);
    if (phaseId !== target.phaseId) continue;
    if (aggregatorRoundId < lo || aggregatorRoundId > hi) {
      continue;
    }
    if (
      !best ||
      row.updatedAt > best.updatedAt ||
      (row.updatedAt === best.updatedAt &&
        aggregatorRoundId >
          decodeRoundId(best.roundId).aggregatorRoundId)
    ) {
      best = row;
    }
  }
  if (best) {
    target.answer = best.answer;
    target.bestUpdatedAt = best.updatedAt;
    target.bestRoundAgg = decodeRoundId(best.roundId).aggregatorRoundId;
  }
}

export function canProveRoundAtOrBefore(
  target: HistoryTarget,
  probes: Map<string, RoundProbe>,
  stepSec: number,
  feedHeartbeatSec: number,
): boolean {
  if (target.answer <= BigInt(0) || target.bestUpdatedAt <= 0) return false;
  if (target.bestUpdatedAt > target.bucketEnd) return false;
  const slop = acceptanceSlopSec(stepSec, feedHeartbeatSec);
  if (target.bestUpdatedAt >= target.bucketEnd - slop) return true;

  const nextAgg = target.bestRoundAgg + BigInt(1);
  if (nextAgg > target.phaseLastRound) return true;
  const nextKey = encodeRoundId(target.phaseId, nextAgg).toString();
  if (!probes.has(nextKey)) return false;
  const next = probes.get(nextKey);
  if (!next?.ok || next.updatedAt <= 0) return true;
  if (next.updatedAt > target.bucketEnd) return true;
  return false;
}

export function targetIsSearchConverged(target: HistoryTarget): boolean {
  return (
    target.hi < target.lo &&
    target.answer > BigInt(0) &&
    target.bestRoundAgg > BigInt(0)
  );
}

export function targetNeedsIntervalWiden(target: HistoryTarget): boolean {
  return target.hi < target.lo && !targetIsSearchConverged(target);
}

export function attemptProveTarget(
  target: HistoryTarget,
  probes: Map<string, RoundProbe>,
  stepSec: number,
  feedHeartbeatSec: number,
): boolean {
  refreshTargetBest(target, probes);
  if (!canProveRoundAtOrBefore(target, probes, stepSec, feedHeartbeatSec)) {
    target.proven = false;
    target.done = false;
    return false;
  }
  target.proven = true;
  target.done = true;
  return true;
}

export function refreshTargetBest(
  target: HistoryTarget,
  probes: Map<string, RoundProbe>,
  scanLo?: bigint,
  scanHi?: bigint,
): void {
  if (targetIsSearchConverged(target)) {
    const best = probes.get(
      encodeRoundId(target.phaseId, target.bestRoundAgg).toString(),
    );
    if (
      best?.ok &&
      best.updatedAt > 0 &&
      best.updatedAt <= target.bucketEnd
    ) {
      target.answer = best.answer;
      target.bestUpdatedAt = best.updatedAt;
      return;
    }
  }

  const lo = scanLo ?? target.lo;
  const hi = scanHi ?? target.hi;
  let best: RoundProbe | null = null;
  for (const row of probes.values()) {
    if (!row.ok || row.updatedAt <= 0 || row.updatedAt > target.bucketEnd) {
      continue;
    }
    const { phaseId, aggregatorRoundId } = decodeRoundId(row.roundId);
    if (phaseId !== target.phaseId) continue;
    if (aggregatorRoundId < lo || aggregatorRoundId > hi) continue;
    if (
      !best ||
      row.updatedAt > best.updatedAt ||
      (row.updatedAt === best.updatedAt &&
        aggregatorRoundId >
          decodeRoundId(best.roundId).aggregatorRoundId)
    ) {
      best = row;
    }
  }
  if (best) {
    target.answer = best.answer;
    target.bestUpdatedAt = best.updatedAt;
    target.bestRoundAgg = decodeRoundId(best.roundId).aggregatorRoundId;
  }
}

export function shouldEmitTargetSample(
  target: HistoryTarget,
): boolean {
  return target.proven && target.answer > BigInt(0);
}

export function targetStillNeedsWork(target: HistoryTarget): boolean {
  return !target.proven || target.answer <= BigInt(0);
}

export function initHistoryTargets(
  bucketStarts: number[],
  stepSec: number,
  phases: PhaseTableRow[],
  historyStartSec: number,
  indexes: Map<number, PhaseRoundIndex>,
  nowSec: number,
): HistoryTarget[] {
  const out: HistoryTarget[] = [];
  for (const bucketStart of bucketStarts) {
    const bucketEnd = Math.min(bucketStart + stepSec, nowSec);
    const phase = pickPhaseForTimestamp(bucketEnd, phases);
    if (!phase || bucketEnd < historyStartSec) continue;
    const index = indexes.get(phase.phaseId);
    const { lo, hi } = index
      ? bracketIntervalForBucketEnd(index, phase, bucketEnd)
      : { lo: BigInt(1), hi: phase.lastRound };
    out.push({
      bucketStart,
      bucketEnd,
      phaseId: phase.phaseId,
      lo,
      hi,
      done: false,
      answer: BigInt(0),
      bestUpdatedAt: 0,
      phaseLastRound: phase.lastRound,
      bestRoundAgg: BigInt(0),
      proven: false,
      widenSteps: 0,
    });
  }
  return out;
}

export function estimateHistoryRpcCalls(
  targetCount: number,
  phaseCount = 3,
): number {
  const probesPerIter = Math.min(
    targetCount * HISTORY_KARY_PROBES,
    targetCount + 64,
  );
  return (
    PHASE_TABLE_HTTP_CALLS +
    estimatePhaseIndexHttpCalls(phaseCount) +
    HISTORY_SEARCH_MAX_ITERATIONS *
      Math.ceil(probesPerIter / HISTORY_MULTICALL_CHUNK)
  );
}

function parseRoundProbe(
  feed: ChainlinkFeedConfig,
  roundId: bigint,
  row: { status: string; result?: unknown },
): RoundProbe {
  if (row.status !== "success") {
    return { roundId, updatedAt: 0, answer: BigInt(0), ok: false };
  }
  const [, answer, , updatedAt] = row.result as readonly [
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
  ];
  const ok =
    validatePositiveAnswer(answer) &&
    Number(updatedAt) > 0 &&
    isStablecoinBandOk(feed, answerToDecimalString(answer, feed.decimals));
  return {
    roundId,
    updatedAt: Number(updatedAt),
    answer,
    ok,
  };
}

async function fetchRoundProbes(
  client: HistoryChainClient,
  feed: ChainlinkFeedConfig,
  roundIds: bigint[],
  chunkSize: number,
  options?: { deadlineAt?: number },
): Promise<{ probes: Map<string, RoundProbe>; deadlineHit: boolean }> {
  const out = new Map<string, RoundProbe>();
  if (roundIds.length === 0) return { probes: out, deadlineHit: false };

  const chunks: bigint[][] = [];
  for (let i = 0; i < roundIds.length; i += chunkSize) {
    chunks.push(roundIds.slice(i, i + chunkSize));
  }

  let nextChunk = 0;
  let deadlineHit = false;
  const workers = Array.from(
    { length: Math.min(HISTORY_PROBE_CONCURRENCY, chunks.length) },
    async () => {
      while (nextChunk < chunks.length) {
        if (options?.deadlineAt && Date.now() >= options.deadlineAt) {
          deadlineHit = true;
          return;
        }
        const chunkIndex = nextChunk;
        nextChunk += 1;
        const chunk = chunks[chunkIndex];
        const results = await client.multicall({
          contracts: chunk.map((roundId) => ({
            address: feed.proxy,
            abi: proxyAbi,
            functionName: "getRoundData",
            args: [roundId],
          })),
          allowFailure: true,
        });

        for (let j = 0; j < chunk.length; j++) {
          out.set(
            chunk[j].toString(),
            parseRoundProbe(feed, chunk[j], results[j]),
          );
        }
      }
    },
  );

  await Promise.all(workers);
  return { probes: out, deadlineHit };
}

/** Gallop + binary search on proxy getRoundData when aggregator latestRound is unavailable. */
export async function findPhaseLastRoundGallop(
  exists: (aggregatorRound: bigint) => Promise<boolean>,
): Promise<bigint> {
  let lastGood = BigInt(1);
  if (!(await exists(lastGood))) return BigInt(1);

  let probe = lastGood * BigInt(2);
  while (true) {
    if (await exists(probe)) {
      lastGood = probe;
      probe = probe * BigInt(2);
    } else {
      break;
    }
  }

  let lo = lastGood;
  let hi = probe - BigInt(1);
  while (lo < hi) {
    const mid = (lo + hi + BigInt(1)) / BigInt(2);
    if (await exists(mid)) lo = mid;
    else hi = mid - BigInt(1);
  }
  return lo;
}

async function findPhaseLastRoundOnProxy(
  client: HistoryChainClient,
  feed: ChainlinkFeedConfig,
  phaseId: number,
): Promise<bigint> {
  const exists = async (agg: bigint) => {
    const row = await fetchRoundProbes(
      client,
      feed,
      [encodeRoundId(phaseId, agg)],
      1,
    );
    return (
      row.probes.get(encodeRoundId(phaseId, agg).toString())?.ok ?? false
    );
  };
  return findPhaseLastRoundGallop(exists);
}

async function readAggregatorLatestRound(
  client: HistoryChainClient,
  aggregator: `0x${string}`,
): Promise<bigint | null> {
  try {
    const value = await client.readContract({
      address: aggregator,
      abi: aggregatorAbi,
      functionName: "latestRound",
    });
    const n = BigInt(value);
    return n > BigInt(0) ? n : null;
  } catch {
    return null;
  }
}

async function buildPhaseTable(
  client: HistoryChainClient,
  feed: ChainlinkFeedConfig,
): Promise<{
  rows: PhaseTableRow[];
  historyStartSec: number;
  latestPhaseId: number;
}> {
  const currentPhase = Number(
    await client.readContract({
      address: feed.proxy,
      abi: proxyAbi,
      functionName: "phaseId",
    }),
  );

  const metaContracts = [
    {
      address: feed.proxy,
      abi: proxyAbi,
      functionName: "latestRoundData" as const,
    },
    ...Array.from({ length: currentPhase }, (_, i) => ({
      address: feed.proxy,
      abi: proxyAbi,
      functionName: "phaseAggregators" as const,
      args: [i + 1] as const,
    })),
  ];

  const metaResults = await client.multicall({
    contracts: metaContracts,
    allowFailure: false,
  });

  const latestTuple = metaResults[0] as readonly [
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
  ];
  const latestRoundId = latestTuple[0];
  const { phaseId: latestPhaseId, aggregatorRoundId: latestAgg } =
    decodeRoundId(latestRoundId);

  const phaseAggregators: Array<{
    phaseId: number;
    address: `0x${string}`;
  }> = [];

  for (let i = 0; i < currentPhase; i++) {
    const address = metaResults[i + 1] as `0x${string}`;
    if (!address || address === "0x0000000000000000000000000000000000000000") {
      continue;
    }
    phaseAggregators.push({ phaseId: i + 1, address });
  }

  const lastRoundByPhase = new Map<number, bigint>();
  for (const { phaseId } of phaseAggregators) {
    lastRoundByPhase.set(
      phaseId,
      phaseId === latestPhaseId ? latestAgg : BigInt(0),
    );
  }

  const historical = phaseAggregators.filter((p) => p.phaseId !== latestPhaseId);
  if (historical.length > 0) {
    const latestRoundResults = await client.multicall({
      contracts: historical.map(({ address }) => ({
        address,
        abi: aggregatorAbi,
        functionName: "latestRound" as const,
      })),
      allowFailure: true,
    });

    for (let i = 0; i < historical.length; i++) {
      const { phaseId, address } = historical[i];
      const row = latestRoundResults[i];
      if (row.status === "success") {
        const v = BigInt(row.result as bigint);
        if (v > BigInt(0)) {
          lastRoundByPhase.set(phaseId, v);
          continue;
        }
      }
      const fallback = await readAggregatorLatestRound(client, address);
      if (fallback) lastRoundByPhase.set(phaseId, fallback);
      else {
        lastRoundByPhase.set(
          phaseId,
          await findPhaseLastRoundOnProxy(client, feed, phaseId),
        );
      }
    }
  }

  const boundRoundIds: bigint[] = [];
  const boundMeta: Array<{ phaseId: number; kind: "first" | "last" }> = [];

  for (const { phaseId } of phaseAggregators) {
    const lastRound = lastRoundByPhase.get(phaseId);
    if (!lastRound || lastRound <= BigInt(0)) continue;
    boundRoundIds.push(encodeRoundId(phaseId, BigInt(1)));
    boundMeta.push({ phaseId, kind: "first" });
    boundRoundIds.push(encodeRoundId(phaseId, lastRound));
    boundMeta.push({ phaseId, kind: "last" });
  }

  const boundResults = await client.multicall({
    contracts: boundRoundIds.map((roundId) => ({
      address: feed.proxy,
      abi: proxyAbi,
      functionName: "getRoundData",
      args: [roundId],
    })),
    allowFailure: true,
  });

  const firstByPhase = new Map<number, RoundProbe>();
  const lastByPhase = new Map<number, RoundProbe>();

  for (let i = 0; i < boundResults.length; i++) {
    const metaRow = boundMeta[i];
    const probe = parseRoundProbe(feed, boundRoundIds[i], boundResults[i]);
    if (metaRow.kind === "first") firstByPhase.set(metaRow.phaseId, probe);
    else lastByPhase.set(metaRow.phaseId, probe);
  }

  const rows: PhaseTableRow[] = [];
  for (const { phaseId } of phaseAggregators) {
    const firstRow = firstByPhase.get(phaseId);
    const lastRow = lastByPhase.get(phaseId);
    const lastRound = lastRoundByPhase.get(phaseId);
    if (!firstRow?.ok || !lastRow?.ok || !lastRound) continue;
    rows.push({
      phaseId,
      firstTs: firstRow.updatedAt,
      lastTs: lastRow.updatedAt,
      lastRound,
    });
  }

  rows.sort((a, b) => a.firstTs - b.firstTs);
  const historyStartSec =
    rows.length > 0
      ? Math.min(...rows.map((r) => r.firstTs))
      : Math.floor(Date.now() / 1000);

  return { rows, historyStartSec, latestPhaseId };
}

export async function buildPhaseRoundIndex(
  client: HistoryChainClient,
  feed: ChainlinkFeedConfig,
  phase: PhaseTableRow,
  closed: boolean,
): Promise<PhaseRoundIndex> {
  const roundIds = sampleRoundIdsForIndex(phase.phaseId, phase.lastRound);
  const chunks: bigint[][] = [];
  for (let i = 0; i < roundIds.length; i += HISTORY_MULTICALL_CHUNK) {
    chunks.push(roundIds.slice(i, i + HISTORY_MULTICALL_CHUNK));
  }
  const chunkPoints = await mapWithConcurrency(
    chunks,
    HISTORY_PROBE_CONCURRENCY,
    async (chunk) => {
      const { probes } = await fetchRoundProbes(
        client,
        feed,
        chunk,
        HISTORY_MULTICALL_CHUNK,
      );
      const local: PhaseRoundIndexPoint[] = [];
      for (const probe of probes.values()) {
        if (!probe.ok || probe.updatedAt <= 0) continue;
        local.push({
          round: decodeRoundId(probe.roundId).aggregatorRoundId,
          updatedAt: probe.updatedAt,
        });
      }
      return local;
    },
  );
  const points = chunkPoints.flat();
  points.sort((a, b) => {
    if (a.round < b.round) return -1;
    if (a.round > b.round) return 1;
    return 0;
  });
  return {
    phaseId: phase.phaseId,
    points,
    closed,
    fetchedAt: Date.now(),
  };
}

export function estimatePhaseIndexHttpCalls(phaseCount: number): number {
  return phaseCount * Math.ceil(PHASE_INDEX_SAMPLES / HISTORY_MULTICALL_CHUNK);
}

export async function loadPhaseContext(
  client: HistoryChainClient,
  feed: ChainlinkFeedConfig,
  forceRefresh = false,
): Promise<CachedPhaseBundle> {
  const key = `${feed.chain}:${feed.proxy}`;
  const hit = phaseBundleCache.get(key);
  if (
    !forceRefresh &&
    hit &&
    Date.now() - hit.fetchedAt < PHASE_TABLE_TTL_MS
  ) {
    return hit;
  }

  const inflight = phaseBundleInFlight.get(key);
  if (inflight) return inflight;

  const build = (async () => {
    const built = await buildPhaseTable(client, feed);
    const indexes = new Map<number, PhaseRoundIndex>();
    const toBuild: Array<{
      row: PhaseTableRow;
      closed: boolean;
      cacheKey: string;
    }> = [];

    for (const row of built.rows) {
      const closed = row.phaseId !== built.latestPhaseId;
      const cacheKey = phaseIndexCacheKey(key, row.phaseId);
      const cached = phaseIndexCache.get(cacheKey);
      const ttl = closed ? CLOSED_PHASE_INDEX_TTL_MS : PHASE_TABLE_TTL_MS;
      if (
        !forceRefresh &&
        cached &&
        Date.now() - cached.fetchedAt < ttl
      ) {
        indexes.set(row.phaseId, cached);
        continue;
      }
      toBuild.push({ row, closed, cacheKey });
    }

    const builtIndexes = await mapWithConcurrency(
      toBuild,
      HISTORY_PROBE_CONCURRENCY,
      async ({ row, closed, cacheKey }) => {
        const index = await buildPhaseRoundIndex(client, feed, row, closed);
        phaseIndexCache.set(cacheKey, index);
        return { phaseId: row.phaseId, index };
      },
    );
    for (const { phaseId, index } of builtIndexes) {
      indexes.set(phaseId, index);
    }

    const bundle: CachedPhaseBundle = {
      rows: built.rows,
      historyStartSec: built.historyStartSec,
      fetchedAt: Date.now(),
      latestPhaseId: built.latestPhaseId,
      indexes,
    };
    phaseBundleCache.set(key, bundle);
    return bundle;
  })().finally(() => {
    phaseBundleInFlight.delete(key);
  });

  phaseBundleInFlight.set(key, build);
  return build;
}

export async function loadPhaseTable(
  client: HistoryChainClient,
  feed: ChainlinkFeedConfig,
  forceRefresh = false,
): Promise<{ rows: PhaseTableRow[]; historyStartSec: number }> {
  const ctx = await loadPhaseContext(client, feed, forceRefresh);
  return { rows: ctx.rows, historyStartSec: ctx.historyStartSec };
}

export async function resolveHistoryWithFetcher(
  fetchProbes: (
    roundIds: bigint[],
  ) => Promise<Map<string, RoundProbe>>,
  phases: PhaseTableRow[],
  indexes: Map<number, PhaseRoundIndex>,
  historyStartSec: number,
  bucketStarts: number[],
  stepSec: number,
  rangeFromSec: number,
  deadlineMs: number,
  feedHeartbeatSec: number,
  nowSec: number,
  onRpcCall?: () => void,
  searchDeadlineAt?: number,
): Promise<HistoryResolveResult> {
  void rangeFromSec;
  const deadlineAt = searchDeadlineAt ?? Date.now() + deadlineMs;
  let rpcCalls = 0;
  const call = async (roundIds: bigint[]) => {
    rpcCalls += 1;
    onRpcCall?.();
    return fetchProbes(roundIds);
  };

  const phaseById = new Map(phases.map((p) => [p.phaseId, p]));
  const targets = initHistoryTargets(
    bucketStarts,
    stepSec,
    phases,
    historyStartSec,
    indexes,
    nowSec,
  );
  const probeCache = new Map<string, RoundProbe>();

  const queueProofRoundIds = (target: HistoryTarget, toFetch: Set<string>) => {
    if (target.bestRoundAgg <= BigInt(0)) return;
    toFetch.add(
      encodeRoundId(target.phaseId, target.bestRoundAgg).toString(),
    );
    const nextAgg = target.bestRoundAgg + BigInt(1);
    if (nextAgg <= target.phaseLastRound) {
      toFetch.add(encodeRoundId(target.phaseId, nextAgg).toString());
    }
  };

  for (let iter = 0; iter < HISTORY_SEARCH_MAX_ITERATIONS; iter++) {
    if (Date.now() >= deadlineAt) break;

    const active = targets.filter((t) => !t.proven);
    if (active.length === 0) break;

    const toFetch = new Set<string>();
    for (const target of active) {
      queueProofRoundIds(target, toFetch);
      if (targetNeedsIntervalWiden(target)) continue;
      if (target.hi < target.lo) continue;
      const count = probeCountForInterval(target.lo, target.hi);
      for (const id of probeAggregatorRounds(
        target.phaseId,
        target.lo,
        target.hi,
        count,
      )) {
        toFetch.add(id.toString());
      }
      if (target.hi - target.lo <= BigInt(1)) {
        toFetch.add(encodeRoundId(target.phaseId, target.lo).toString());
        if (target.hi !== target.lo) {
          toFetch.add(encodeRoundId(target.phaseId, target.hi).toString());
        }
      }
    }

    const missing = [...toFetch].filter((k) => !probeCache.has(k));
    if (missing.length > 0) {
      const fetched = await call(missing.map((s) => BigInt(s)));
      for (const [k, v] of fetched) probeCache.set(k, v);
    }

    for (const target of active) {
      const phase = phaseById.get(target.phaseId);
      const index = indexes.get(target.phaseId);
      if (!phase || !index) continue;

      if (targetNeedsIntervalWiden(target)) {
        if (target.widenSteps < 6) {
          expandTargetInterval(target, index, phase);
        }
        continue;
      }

      if (target.hi >= target.lo && target.hi - target.lo > BigInt(1)) {
        narrowTargetInterval(target, probeCache);
      }

      if (targetNeedsIntervalWiden(target)) {
        if (target.widenSteps < 6) {
          expandTargetInterval(target, index, phase);
        }
        continue;
      }

      attemptProveTarget(target, probeCache, stepSec, feedHeartbeatSec);
    }
  }

  const samples: HistoryResolveResult["samples"] = [];
  for (const target of targets) {
    if (!shouldEmitTargetSample(target)) continue;
    samples.push({
      t: bucketLabelTimestamp(target.bucketStart, stepSec, nowSec),
      bucketStart: target.bucketStart,
      answer: target.answer,
      answerUpdatedAt: target.bestUpdatedAt,
    });
  }

  const partial = targets.some((t) => targetStillNeedsWork(t));

  return {
    samples,
    partial,
    historyStartSec,
    rpcCalls,
  };
}

export async function resolveHistoryPoints(
  client: HistoryChainClient,
  feed: ChainlinkFeedConfig,
  bucketStarts: number[],
  stepSec: number,
  rangeFromSec: number,
  deadlineMs = HISTORY_DEADLINE_MS,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<HistoryResolveResult> {
  const ctx = await loadPhaseContext(client, feed);
  let chunk = HISTORY_MULTICALL_CHUNK;
  const searchDeadlineAt = Date.now() + deadlineMs;

  const fetchProbes = async (roundIds: bigint[]) => {
    try {
      const { probes } = await fetchRoundProbes(
        client,
        feed,
        roundIds,
        chunk,
        { deadlineAt: searchDeadlineAt },
      );
      return probes;
    } catch {
      chunk = HISTORY_FALLBACK_MULTICALL_CHUNK;
      const { probes } = await fetchRoundProbes(client, feed, roundIds, chunk, {
        deadlineAt: searchDeadlineAt,
      });
      return probes;
    }
  };

  const result = await resolveHistoryWithFetcher(
    fetchProbes,
    ctx.rows,
    ctx.indexes,
    ctx.historyStartSec,
    bucketStarts,
    stepSec,
    rangeFromSec,
    deadlineMs,
    feed.heartbeatS,
    nowSec,
    undefined,
    searchDeadlineAt,
  );

  return {
    ...result,
    rpcCalls:
      result.rpcCalls +
      PHASE_TABLE_HTTP_CALLS +
      estimatePhaseIndexHttpCalls(ctx.rows.length),
  };
}
