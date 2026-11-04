import "server-only";

import Decimal from "decimal.js";
import type { ChainlinkFeedConfig } from "./types";

/** Redact RPC keys embedded in URLs before logging or returning errors. */
export function redactSensitiveUrl(text: string): string {
  return text.replace(
    /https:\/\/api-[a-z0-9-]+\.n\.dwellir\.com\/[A-Za-z0-9_-]+/gi,
    "https://api-[redacted].n.dwellir.com/[redacted]",
  );
}

export function redactErrorMessage(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Unknown error";
  return redactSensitiveUrl(raw);
}

export function answerToDecimalString(answer: bigint, decimals: number): string {
  const d = new Decimal(answer.toString()).div(new Decimal(10).pow(decimals));
  return d.toFixed();
}

export function isNgnForexMarketClosed(nowMs: number): boolean {
  const d = new Date(nowMs);
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

export function isFeedAnswerStale(
  feed: ChainlinkFeedConfig,
  updatedAtSec: number,
  nowSec: number,
): { stale: boolean; marketClosed: boolean } {
  const marketClosed = feed.forexNgn
    ? isNgnForexMarketClosed(nowSec * 1000)
    : false;
  if (marketClosed) {
    return { stale: false, marketClosed: true };
  }
  const age = nowSec - updatedAtSec;
  const limit = feed.heartbeatS * 1.5;
  return { stale: age > limit, marketClosed: false };
}

export function isStablecoinBandOk(
  feed: ChainlinkFeedConfig,
  priceUsd: string,
): boolean {
  if (!feed.stableBand) return true;
  const p = new Decimal(priceUsd);
  const [min, max] = feed.stableBand;
  return p.gte(min) && p.lte(max);
}

export function validatePositiveAnswer(answer: bigint): boolean {
  return answer > BigInt(0);
}

export function cmcNumberToString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Decimal(n).toFixed();
}

export function multiplyDecimalStrings(a: string, b: string): string {
  return new Decimal(a).mul(b).toFixed();
}

export function pctChangeDecimal(current: string, past: string): string {
  const cur = new Decimal(current);
  const prev = new Decimal(past);
  if (prev.isZero()) return "0";
  return cur.minus(prev).div(prev).mul(100).toFixed(4);
}

export function absChangeDecimal(current: string, past: string): string {
  return new Decimal(current).minus(past).toFixed();
}
