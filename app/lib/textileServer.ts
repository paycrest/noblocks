/** Shared Textile FX upstream helpers for server proxy routes. */

import {
  isTextileCorridorPair,
  TEXTILE_SUPPORTED_CHAIN_IDS,
} from "./textileNetworks";

export const TEXTILE_API_V2_BASE = "https://api.textilecredit.com/v2";
export const TEXTILE_PREVIEW_TIMEOUT_MS = 15_000;
/** RFQ request blocks while makers reply (~750 ms default); allow headroom for network. */
export const TEXTILE_RFQ_REQUEST_TIMEOUT_MS = 20_000;
export const TEXTILE_UPSTREAM_TIMEOUT_MS = 15_000;

export function textileAuthHeaders(): Record<string, string> {
  const key = process.env.TEXTILE_API_KEY || "";
  const headers: Record<string, string> = {};
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

/** Optional claim token for RFQ cancel/submit/status when not using the requesting API key. */
export function textileRfqClaimHeaders(
  claimToken?: string | null,
): Record<string, string> {
  if (!claimToken?.trim()) return {};
  return { "X-Rfq-Claim": claimToken.trim() };
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

function validateTextileCorridorBody(
  body: Record<string, unknown>,
  requireTaker: boolean,
): { ok: true } | { ok: false; error: string } {
  const missing = [
    body.chainId === undefined || body.chainId === null ? "chainId" : null,
    !isNonEmptyString(body.sellToken) ? "sellToken" : null,
    !isNonEmptyString(body.buyToken) ? "buyToken" : null,
    !isNonEmptyString(body.sellAmount) ? "sellAmount" : null,
    requireTaker && !isNonEmptyString(body.taker) ? "taker" : null,
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

  if (!isEvmAddress(sellToken) || !isEvmAddress(buyToken)) {
    return { ok: false, error: "sellToken and buyToken must be valid EVM addresses" };
  }

  if (requireTaker) {
    const taker = body.taker as string;
    if (!isEvmAddress(taker)) {
      return { ok: false, error: "taker must be a valid EVM address" };
    }
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

  return { ok: true };
}

/** POST /v2/rfq/preview — same body as request minus taker. */
export function validateTextilePreviewBody(
  body: Record<string, unknown>,
): { ok: true } | { ok: false; error: string } {
  return validateTextileCorridorBody(body, false);
}

/** POST /v2/rfq/request — firm quote with taker wallet. */
export function validateTextileRequestBody(
  body: Record<string, unknown>,
): { ok: true } | { ok: false; error: string } {
  return validateTextileCorridorBody(body, true);
}

/** @deprecated v1 name — use validateTextileRequestBody */
export const validateTextileSwapBody = validateTextileRequestBody;

export function validateTextileSubmitBody(
  body: Record<string, unknown>,
): { ok: true; rfqId: string } | { ok: false; error: string } {
  const rfqId =
    (isNonEmptyString(body.rfqId) && body.rfqId) ||
    (isNonEmptyString(body.swapId) && body.swapId) ||
    null;

  if (!rfqId || !isNonEmptyString(body.txHash)) {
    return { ok: false, error: "rfqId and txHash are required" };
  }
  return { ok: true, rfqId };
}

const TEXTILE_RFQ_CLAIM_PREFIX = "textile-rfq-claim:";

/** Persist RFQ claim token for status polling (browser only). */
export function storeTextileRfqClaim(rfqId: string, claimToken: string): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(`${TEXTILE_RFQ_CLAIM_PREFIX}${rfqId}`, claimToken);
}

export function getTextileRfqClaim(rfqId: string): string | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage.getItem(`${TEXTILE_RFQ_CLAIM_PREFIX}${rfqId}`);
}
