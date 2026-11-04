import "server-only";

import { LRUCache } from "lru-cache";
import type { HistoryRange } from "./types";

/** Closed buckets are immutable — cache for 7 days. */
const CLOSED_BUCKET_TTL_MS = 7 * 24 * 60 * 60_000;
/** Open (current) bucket follows price freshness. */
const OPEN_BUCKET_TTL_MS = 60_000;

export interface HistoryBucketPoint {
  t: number;
  p: string;
}

interface CachedBucket {
  value: HistoryBucketPoint;
  fetchedAt: number;
  closed: boolean;
}

const bucketCache = new LRUCache<string, CachedBucket>({ max: 4096 });

export function resetHistoryBucketCacheForTests(): void {
  bucketCache.clear();
}

export function historyBucketKey(
  id: string,
  range: HistoryRange,
  bucketStartSec: number,
): string {
  return `hist:${id}:${range}:${bucketStartSec}`;
}

export function isBucketClosed(
  bucketStartSec: number,
  stepSec: number,
  nowSec: number,
): boolean {
  return nowSec >= bucketStartSec + stepSec;
}

export function getHistoryBucket(
  key: string,
  closed: boolean,
): HistoryBucketPoint | null {
  const hit = bucketCache.get(key);
  if (!hit) return null;
  const ttl = closed ? CLOSED_BUCKET_TTL_MS : OPEN_BUCKET_TTL_MS;
  if (Date.now() - hit.fetchedAt >= ttl) return null;
  return hit.value;
}

export function setHistoryBucket(
  key: string,
  point: HistoryBucketPoint,
  closed: boolean,
): void {
  bucketCache.set(key, {
    value: point,
    fetchedAt: Date.now(),
    closed,
  });
}
