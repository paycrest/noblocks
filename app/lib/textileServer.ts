/** Shared Textile FX upstream helpers for server proxy routes. */

import {
  isTextileCorridorPair,
  TEXTILE_SUPPORTED_CHAIN_IDS,
} from "./textileNetworks";

export const TEXTILE_API_BASE = "https://api.textilecredit.com/v1";
export const TEXTILE_UPSTREAM_TIMEOUT_MS = 15_000;

export function textileAuthHeaders(): Record<string, string> {
  const key = process.env.TEXTILE_API_KEY || "";
  const headers: Record<string, string> = {};
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

/** Debt-per-collateral floor (RAY) after applying slippage tolerance. */
export function minRateRayFromEffective(
  effectiveRateRay: string,
  slippageBps: number,
): string {
  try {
    const rate = BigInt(effectiveRateRay);
    const factor = BigInt(Math.max(0, 10_000 - slippageBps));
    return ((rate * factor) / BigInt(10_000)).toString();
  } catch {
    return "0";
  }
}

/** True when a RAY-scaled rate string is a positive integer. */
export function isPositiveRayRate(value: unknown): boolean {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  try {
    return BigInt(value) > BigInt(0);
  } catch {
    return false;
  }
}

/** Parse request JSON body; rejects null, arrays, and non-objects with 400. */
export function parseJsonObjectBody(
  value: unknown,
): { ok: true; body: Record<string, unknown> } | { ok: false; error: string } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Request body must be a JSON object" };
  }
  return { ok: true, body: value as Record<string, unknown> };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isEvmAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

function parseChainId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
  }
  return null;
}

function isPositiveAtomicAmount(value: unknown): boolean {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  try {
    return BigInt(value) > BigInt(0);
  } catch {
    return false;
  }
}

export function validateTextileSwapBody(
  body: Record<string, unknown>,
): { ok: true } | { ok: false; error: string } {
  const missing = [
    body.chainId === undefined || body.chainId === null ? "chainId" : null,
    !isNonEmptyString(body.sellToken) ? "sellToken" : null,
    !isNonEmptyString(body.buyToken) ? "buyToken" : null,
    !isNonEmptyString(body.sellAmount) ? "sellAmount" : null,
    !isNonEmptyString(body.minRate) ? "minRate" : null,
    !isNonEmptyString(body.taker) ? "taker" : null,
  ].filter(Boolean);

  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing required fields: ${missing.join(", ")}`,
    };
  }

  const chainId = parseChainId(body.chainId);
  if (chainId === null || !TEXTILE_SUPPORTED_CHAIN_IDS.has(chainId)) {
    return {
      ok: false,
      error: "chainId must be a supported Textile corridor (56 or 42220)",
    };
  }

  const sellToken = body.sellToken as string;
  const buyToken = body.buyToken as string;
  const taker = body.taker as string;

  if (!isEvmAddress(sellToken) || !isEvmAddress(buyToken) || !isEvmAddress(taker)) {
    return { ok: false, error: "sellToken, buyToken, and taker must be valid EVM addresses" };
  }

  if (sellToken.toLowerCase() === buyToken.toLowerCase()) {
    return { ok: false, error: "sellToken and buyToken must differ" };
  }

  if (!isTextileCorridorPair(chainId, sellToken, buyToken)) {
    return {
      ok: false,
      error: "Token pair is not a supported Textile USDT↔cNGN corridor on this chain",
    };
  }

  if (!isPositiveAtomicAmount(body.sellAmount)) {
    return { ok: false, error: "sellAmount must be a positive atomic amount string" };
  }

  if (!isPositiveRayRate(body.minRate)) {
    return { ok: false, error: "minRate must be a positive RAY-scaled integer string" };
  }

  return { ok: true };
}

export function validateTextileSubmitBody(
  body: Record<string, unknown>,
): { ok: true } | { ok: false; error: string } {
  if (!isNonEmptyString(body.swapId) || !isNonEmptyString(body.txHash)) {
    return { ok: false, error: "swapId and txHash are required" };
  }
  return { ok: true };
}

/**
 * Stable idempotency key for the same swap intent (retries replay Textile's first response).
 */
export function textileIdempotencyKey(params: {
  chainId: number;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  taker: string;
  minRate: string;
}): string {
  return [
    params.chainId,
    params.sellToken.toLowerCase(),
    params.buyToken.toLowerCase(),
    params.sellAmount,
    params.taker.toLowerCase(),
    params.minRate,
  ].join(":");
}
