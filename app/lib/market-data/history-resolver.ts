import "server-only";

import {
  parseAbi,
  type PublicClient,
} from "viem";
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
export const HISTORY_MAX_KARY_ITERATIONS = 6;
export const PHASE_TABLE_TTL_MS = 60 * 60 * 1000;

const proxyAbi = parseAbi([
  "function phaseId() view returns (uint16)",
  "function phaseAggregators(uint16 phaseId) view returns (address)",
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function getRoundData(uint80 roundId) view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() view returns (uint8)",
  "function description() view returns (string)",
]);

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

export function resetPhaseTableCacheForTests(): void {
  phaseTableCache.clear();
}

export type HistoryChainClient = Pick<
  PublicClient,
  "multicall" | "readContract"
>;

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

function pickBestAtOrBefore(
  target: HistoryTarget,
  probes: Map<string, RoundProbe>,
): void {
  const candidates: RoundProbe[] = [];
  for (let agg = target.lo; agg <= target.hi; agg += BigInt(1)) {
    const row = probes.get(encodeRoundId(target.phaseId, agg).toString());
    if (!row?.ok || row.updatedAt <= 0 || row.updatedAt > target.bucketEnd) {
      continue;
    }
    candidates.push(row);
  }
  if (candidates.length > 0) {
    target.answer = candidates.reduce((a, b) =>
      a.updatedAt >= b.updatedAt ? a : b,
    ).answer;
  }
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

export function estimateHistoryRpcCalls(targetCount: number): number {
  const probesPerIter = Math.min(
    targetCount * HISTORY_KARY_PROBES,
    targetCount + 64,
  );
  return (
    4 +
    HISTORY_MAX_KARY_ITERATIONS *
      Math.ceil(probesPerIter / HISTORY_MULTICALL_CHUNK)
  );
}

async function fetchRoundProbes(
  client: HistoryChainClient,
  feed: ChainlinkFeedConfig,
  roundIds: bigint[],
  chunkSize: number,
): Promise<Map<string, RoundProbe>> {
  const out = new Map<string, RoundProbe>();
  if (roundIds.length === 0) return out;

  for (let i = 0; i < roundIds.length; i += chunkSize) {
    const chunk = roundIds.slice(i, i + chunkSize);
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
      const roundId = chunk[j];
      const row = results[j];
      if (row.status !== "success") {
        out.set(roundId.toString(), {
          roundId,
          updatedAt: 0,
          answer: BigInt(0),
          ok: false,
        });
        continue;
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
        isStablecoinBandOk(
          feed,
          answerToDecimalString(answer, feed.decimals),
        );
      out.set(roundId.toString(), {
        roundId,
        updatedAt: Number(updatedAt),
        answer,
        ok,
      });
    }
  }
  return out;
}

async function findPhaseLastRound(
  client: HistoryChainClient,
  feed: ChainlinkFeedConfig,
  phaseId: number,
): Promise<bigint> {
  let lo = BigInt(1);
  let hi = BigInt(1);
  const first = await fetchRoundProbes(
    client,
    feed,
    [encodeRoundId(phaseId, hi)],
    1,
  );
  if (!first.get(encodeRoundId(phaseId, hi).toString())?.ok) {
    return BigInt(1);
  }

  while (true) {
    const probe = hi * BigInt(2);
    const row = await fetchRoundProbes(
      client,
      feed,
      [encodeRoundId(phaseId, probe)],
      1,
    );
    if (row.get(encodeRoundId(phaseId, probe).toString())?.ok) {
      lo = hi;
      hi = probe;
    } else {
      break;
    }
    if (hi > BigInt(1_000_000)) break;
  }

  while (lo < hi) {
    const mid = (lo + hi + BigInt(1)) / BigInt(2);
    const row = await fetchRoundProbes(
      client,
      feed,
      [encodeRoundId(phaseId, mid)],
      1,
    );
    if (row.get(encodeRoundId(phaseId, mid).toString())?.ok) lo = mid;
    else hi = mid - BigInt(1);
  }
  return lo;
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

  const currentPhase = Number(
    await client.readContract({
      address: feed.proxy,
      abi: proxyAbi,
      functionName: "phaseId",
    }),
  );

  const latest = await client.readContract({
    address: feed.proxy,
    abi: proxyAbi,
    functionName: "latestRoundData",
  });
  const latestRoundId = latest[0] as bigint;
  const { phaseId: latestPhaseId, aggregatorRoundId: latestAgg } =
    decodeRoundId(latestRoundId);

  const rows: PhaseTableRow[] = [];

  for (let phase = 1; phase <= currentPhase; phase++) {
    const aggregator = await client.readContract({
      address: feed.proxy,
      abi: proxyAbi,
      functionName: "phaseAggregators",
      args: [phase],
    });
    if (
      !aggregator ||
      aggregator === "0x0000000000000000000000000000000000000000"
    ) {
      continue;
    }

    const firstId = encodeRoundId(phase, BigInt(1));
    const lastRound =
      phase === latestPhaseId
        ? latestAgg
        : await findPhaseLastRound(client, feed, phase);

    const bounds = await fetchRoundProbes(
      client,
      feed,
      [firstId, encodeRoundId(phase, lastRound)],
      2,
    );
    const firstRow = bounds.get(firstId.toString());
    const lastRow = bounds.get(encodeRoundId(phase, lastRound).toString());
    if (!firstRow?.ok || !lastRow?.ok) continue;

    rows.push({
      phaseId: phase,
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

  phaseTableCache.set(key, {
    rows,
    historyStartSec,
    fetchedAt: Date.now(),
  });

  return { rows, historyStartSec };
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
  const probeCache = new Map<string, RoundProbe>();
  let deadlineHit = false;

  for (let iter = 0; iter < HISTORY_MAX_KARY_ITERATIONS; iter++) {
    if (Date.now() >= deadlineAt) {
      deadlineHit = true;
      break;
    }
    const unresolved = targets.filter((t) => !t.done && t.hi >= t.lo);
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

  for (const target of targets.filter((t) => !t.done && t.hi >= t.lo)) {
    pickBestAtOrBefore(target, probeCache);
  }

  const samples: HistoryResolveResult["samples"] = [];
  for (const target of targets) {
    if (!target.done || target.answer <= BigInt(0)) continue;
    samples.push({
      t: target.bucketEnd,
      bucketStart: target.bucketStart,
      answer: target.answer,
    });
  }

  const partial =
    targets.some((t) => !t.done) ||
    rangeFromSec + 60 < historyStartSec ||
    deadlineHit;

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

  const fetchProbes = async (roundIds: bigint[]) => {
    try {
      return await fetchRoundProbes(client, feed, roundIds, chunk);
    } catch {
      chunk = HISTORY_FALLBACK_MULTICALL_CHUNK;
      return await fetchRoundProbes(client, feed, roundIds, chunk);
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
    rpcCalls: result.rpcCalls + 2,
  };
}
