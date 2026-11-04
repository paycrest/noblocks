import "server-only";

import type { ChainlinkFeedConfig } from "./types";

export const HISTORY_DEADLINE_MS = 8_000;
export const HISTORY_MAX_ROUND_STEPS = 500;
export const HISTORY_ROUND_MULTICALL_CHUNK = 40;

export interface RoundSample {
  updatedAt: number;
  answer: bigint;
}

/** Latest oracle round at or before the bucket end (start + step). */
export function pickRoundForBucket(
  rounds: RoundSample[],
  bucketStartSec: number,
  bucketEndSec: number,
): RoundSample | null {
  if (rounds.length === 0) return null;
  let best: RoundSample | null = null;
  for (const r of rounds) {
    if (r.updatedAt > bucketEndSec) continue;
    if (r.updatedAt < bucketStartSec - 86400 * 7) continue;
    if (!best || r.updatedAt > best.updatedAt) best = r;
  }
  return best;
}

export function decodeRoundId(roundId: bigint): {
  phase: bigint;
  round: bigint;
} {
  const phase = roundId >> BigInt(64);
  const round = roundId & ((BigInt(1) << BigInt(64)) - BigInt(1));
  return { phase, round };
}

export function previousRoundId(roundId: bigint): bigint | null {
  if (roundId <= BigInt(0)) return null;
  const { phase, round } = decodeRoundId(roundId);
  if (round > BigInt(1)) {
    return (phase << BigInt(64)) | (round - BigInt(1));
  }
  if (phase === BigInt(0)) return null;
  return roundId - BigInt(1);
}

export function historyDeadlineExceeded(deadlineAtMs: number): boolean {
  return Date.now() >= deadlineAtMs;
}

export function minBucketTimestamp(timestamps: number[]): number {
  return timestamps.reduce((m, t) => (t < m ? t : m), timestamps[0] ?? 0);
}

export function mapBucketsToRounds(
  feed: ChainlinkFeedConfig,
  rounds: RoundSample[],
  bucketStarts: number[],
  stepSec: number,
): Array<{ t: number; answer: bigint; decimals: number }> {
  const out: Array<{ t: number; answer: bigint; decimals: number }> = [];
  for (const t of bucketStarts) {
    const sample = pickRoundForBucket(rounds, t, t + stepSec);
    if (!sample) continue;
    out.push({
      t,
      answer: sample.answer,
      decimals: feed.decimals,
    });
  }
  return out;
}
