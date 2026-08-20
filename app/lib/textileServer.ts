/** Shared Textile FX upstream helpers for server proxy routes. */

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
export function isPositiveRayRate(value: string): boolean {
  try {
    return BigInt(value) > BigInt(0);
  } catch {
    return false;
  }
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
