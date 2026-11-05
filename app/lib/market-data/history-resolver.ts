import "server-only";

import { parseAbi, type PublicClient } from "viem";
import type { ChainlinkFeedConfig } from "./types";
import { decodeRoundId, encodeRoundId } from "./round-id";
import {
  answerToDecimalString,
  isStablecoinBandOk,
  validatePositiveAnswer,
} from "./validate";

export const HISTORY_DEADLINE_MS = 8_000;
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
}

export interface HistoryResolveResult {
  samples: Array<{ t: number; bucketStart: number; answer: bigint }>;
  partial: boolean;
  historyStartSec: number;
  rpcCalls: number;
}

interface CachedPhaseTable {
  rows: PhaseTableRow[];
  historyStartSec: number;
  fetchedAt: number;
}

const phaseTableCache = new Map<string, CachedPhaseTable>();
const phaseTableInFlight = new Map<
  string,
  Promise<{ rows: PhaseTableRow[]; historyStartSec: number }>
>();

export function resetPhaseTableCacheForTests(): void {
  phaseTableCache.clear();
  phaseTableInFlight.clear();
}

export type HistoryChainClient = Pick<
  PublicClient,
  "multicall" | "readContract"
>;

export function karySearchIterations(maxLastRound: bigint): number {
  const n = Number(maxLastRound);
  if (!Number.isFinite(n) || n <= 1) return 4;
  return Math.ceil(Math.log(n) / Math.log(7)) + 2;
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

  if (target.hi < target.lo) {
    target.done = true;
  }
}

export function pickBestAtOrBefore(
  target: HistoryTarget,
  probes: Map<string, RoundProbe>,
): void {
  let best: RoundProbe | null = null;
  for (const row of probes.values()) {
    if (!row.ok || row.updatedAt <= 0 || row.updatedAt > target.bucketEnd) {
      continue;
    }
    const { phaseId, aggregatorRoundId } = decodeRoundId(row.roundId);
    if (phaseId !== target.phaseId) continue;
    if (aggregatorRoundId < target.lo || aggregatorRoundId > target.hi) {
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
  if (best) target.answer = best.answer;
  target.done = true;
}

export function initHistoryTargets(
  bucketStarts: number[],
  stepSec: number,
  phases: PhaseTableRow[],
  historyStartSec: number,
): HistoryTarget[] {
  const out: HistoryTarget[] = [];
  for (const bucketStart of bucketStarts) {
    const bucketEnd = bucketStart + stepSec;
    const phase = pickPhaseForTimestamp(bucketEnd, phases);
    if (!phase || bucketEnd < historyStartSec) continue;
    out.push({
      bucketStart,
      bucketEnd,
      phaseId: phase.phaseId,
      lo: BigInt(1),
      hi: phase.lastRound,
      done: false,
      answer: BigInt(0),
    });
  }
  return out;
}

export function estimateHistoryRpcCalls(
  targetCount: number,
  maxLastRound: bigint = BigInt(30_000),
): number {
  const probesPerIter = Math.min(
    targetCount * HISTORY_KARY_PROBES,
    targetCount + 64,
  );
  const iterations = karySearchIterations(maxLastRound);
  return (
    PHASE_TABLE_HTTP_CALLS +
    iterations * Math.ceil(probesPerIter / HISTORY_MULTICALL_CHUNK)
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
): Promise<Map<string, RoundProbe>> {
  const out = new Map<string, RoundProbe>();
  if (roundIds.length === 0) return out;

  const chunks: bigint[][] = [];
  for (let i = 0; i < roundIds.length; i += chunkSize) {
    chunks.push(roundIds.slice(i, i + chunkSize));
  }

  let nextChunk = 0;
  const workers = Array.from(
    { length: Math.min(HISTORY_PROBE_CONCURRENCY, chunks.length) },
    async () => {
      while (nextChunk < chunks.length) {
        if (options?.deadlineAt && Date.now() >= options.deadlineAt) {
          throw new HistoryDeadlineError();
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
  return out;
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
    return row.get(encodeRoundId(phaseId, agg).toString())?.ok ?? false;
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
): Promise<{ rows: PhaseTableRow[]; historyStartSec: number }> {
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

  return { rows, historyStartSec };
}

export async function loadPhaseTable(
  client: HistoryChainClient,
  feed: ChainlinkFeedConfig,
  forceRefresh = false,
): Promise<{ rows: PhaseTableRow[]; historyStartSec: number }> {
  const key = `${feed.chain}:${feed.proxy}`;
  const hit = phaseTableCache.get(key);
  if (
    !forceRefresh &&
    hit &&
    Date.now() - hit.fetchedAt < PHASE_TABLE_TTL_MS
  ) {
    return { rows: hit.rows, historyStartSec: hit.historyStartSec };
  }

  const inflight = phaseTableInFlight.get(key);
  if (inflight) return inflight;

  const build = (async () => {
    const built = await buildPhaseTable(client, feed);
    phaseTableCache.set(key, {
      rows: built.rows,
      historyStartSec: built.historyStartSec,
      fetchedAt: Date.now(),
    });
    return built;
  })().finally(() => {
    phaseTableInFlight.delete(key);
  });

  phaseTableInFlight.set(key, build);
  return build;
}

export async function resolveHistoryWithFetcher(
  fetchProbes: (
    roundIds: bigint[],
  ) => Promise<Map<string, RoundProbe>>,
  phases: PhaseTableRow[],
  historyStartSec: number,
  bucketStarts: number[],
  stepSec: number,
  rangeFromSec: number,
  deadlineMs: number,
  onRpcCall?: () => void,
): Promise<HistoryResolveResult> {
  void rangeFromSec;
  const deadlineAt = Date.now() + deadlineMs;
  let rpcCalls = 0;
  const call = async (roundIds: bigint[]) => {
    rpcCalls += 1;
    onRpcCall?.();
    return fetchProbes(roundIds);
  };

  const targets = initHistoryTargets(
    bucketStarts,
    stepSec,
    phases,
    historyStartSec,
  );
  const maxLastRound = phases.reduce(
    (m, row) => (row.lastRound > m ? row.lastRound : m),
    BigInt(1),
  );
  const maxIterations = karySearchIterations(maxLastRound);
  const probeCache = new Map<string, RoundProbe>();

  try {
    for (let iter = 0; iter < maxIterations; iter++) {
      if (Date.now() >= deadlineAt) break;
      const unresolved = targets.filter(
        (t) => !t.done && t.hi >= t.lo && t.hi - t.lo > BigInt(1),
      );
      if (unresolved.length === 0) break;

      const toFetch = new Set<string>();
      for (const target of unresolved) {
        if (target.hi - target.lo <= BigInt(1)) {
          toFetch.add(encodeRoundId(target.phaseId, target.lo).toString());
          toFetch.add(encodeRoundId(target.phaseId, target.hi).toString());
          continue;
        }
        for (const id of probeAggregatorRounds(
          target.phaseId,
          target.lo,
          target.hi,
          HISTORY_KARY_PROBES,
        )) {
          toFetch.add(id.toString());
        }
      }

      const missing = [...toFetch].filter((k) => !probeCache.has(k));
      if (missing.length > 0) {
        const fetched = await call(missing.map((s) => BigInt(s)));
        for (const [k, v] of fetched) probeCache.set(k, v);
      }

      for (const target of unresolved) {
        if (target.hi - target.lo <= BigInt(1)) {
          pickBestAtOrBefore(target, probeCache);
          continue;
        }
        narrowTargetInterval(target, probeCache);
        if (target.hi - target.lo <= BigInt(1) || target.done) {
          pickBestAtOrBefore(target, probeCache);
        }
      }
    }
  } catch (err) {
    if (!(err instanceof HistoryDeadlineError)) throw err;
  }

  for (const target of targets.filter((t) => t.hi - t.lo > BigInt(1))) {
    pickBestAtOrBefore(target, probeCache);
  }

  const samples: HistoryResolveResult["samples"] = [];
  for (const target of targets) {
    if (target.hi - target.lo > BigInt(1)) continue;
    if (target.answer <= BigInt(0)) continue;
    samples.push({
      t: target.bucketEnd,
      bucketStart: target.bucketStart,
      answer: target.answer,
    });
  }

  const partial = targets.some(isTargetIntervalUnresolved);

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
): Promise<HistoryResolveResult> {
  const { rows, historyStartSec } = await loadPhaseTable(client, feed);
  let chunk = HISTORY_MULTICALL_CHUNK;
  const deadlineAt = Date.now() + deadlineMs;

  const fetchProbes = async (roundIds: bigint[]) => {
    try {
      return await fetchRoundProbes(client, feed, roundIds, chunk, {
        deadlineAt,
      });
    } catch (err) {
      if (err instanceof HistoryDeadlineError) throw err;
      chunk = HISTORY_FALLBACK_MULTICALL_CHUNK;
      return await fetchRoundProbes(client, feed, roundIds, chunk, {
        deadlineAt,
      });
    }
  };

  const result = await resolveHistoryWithFetcher(
    fetchProbes,
    rows,
    historyStartSec,
    bucketStarts,
    stepSec,
    rangeFromSec,
    deadlineMs,
  );

  return {
    ...result,
    rpcCalls: result.rpcCalls + PHASE_TABLE_HTTP_CALLS,
  };
}
