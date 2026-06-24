/**
 * Scorechain Free Sanctions Screening API (server-only).
 *
 * GET https://sanctions.api.scorechain.com/v1/addresses/{address}
 *   header: x-api-key: <SCORECHAIN_API_KEY>
 *   200 -> array of { isSanctioned, details? }
 *
 * Free tier: non-commercial, 100 requests/hour (429 over limit). We cache per-address for an
 * hour to stay under that ceiling. TODO: move to a commercial Scorechain plan before scale.
 *
 * Callers MUST fail-closed: if `screenAddress` throws (network error, timeout, 429, non-2xx),
 * do NOT forward funds — hold the transaction for manual review.
 */

const SCORECHAIN_BASE_URL = "https://sanctions.api.scorechain.com";
const REQUEST_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 60 * 60 * 1_000; // 1h

export interface SanctionDetails {
  name?: string;
  sanctionDate?: number;
  prettySanctionDate?: string;
  blockchain?: string;
}

export interface SanctionScreenResult {
  isSanctioned: boolean;
  /** Populated only when isSanctioned is true. */
  details?: SanctionDetails;
}

interface CacheEntry {
  result: SanctionScreenResult;
  expiresAt: number;
}

// Per-address in-memory cache, keyed by lowercased address.
const cache = new Map<string, CacheEntry>();

function getApiKey(): string {
  const key = (process.env.SCORECHAIN_API_KEY ?? "").trim();
  if (!key) {
    throw new Error("SCORECHAIN_API_KEY is not configured");
  }
  return key;
}

/**
 * Narrow the raw array response to our typed result. The API returns an array of matches.
 * Fail closed on malformed payloads (non-array, wrong shape, HTML/error body behind a 200) by
 * throwing so callers land in `held_review` rather than incorrectly clearing the destination.
 */
function parseResponse(body: unknown): SanctionScreenResult {
  if (!Array.isArray(body)) {
    throw new Error("Scorechain returned an unexpected response shape");
  }
  // Empty array = no sanction record found = clean.
  if (body.length === 0) {
    return { isSanctioned: false };
  }
  const first = body[0];
  if (
    !first ||
    typeof first !== "object" ||
    typeof (first as Record<string, unknown>).isSanctioned !== "boolean"
  ) {
    throw new Error("Scorechain returned an unexpected response shape");
  }
  const o = first as Record<string, unknown>;
  const isSanctioned = o.isSanctioned === true;
  if (!isSanctioned) return { isSanctioned: false };

  const rawDetails =
    o.details && typeof o.details === "object"
      ? (o.details as Record<string, unknown>)
      : undefined;
  const details: SanctionDetails | undefined = rawDetails
    ? {
        name: typeof rawDetails.name === "string" ? rawDetails.name : undefined,
        sanctionDate:
          typeof rawDetails.sanctionDate === "number"
            ? rawDetails.sanctionDate
            : undefined,
        prettySanctionDate:
          typeof rawDetails.prettySanctionDate === "string"
            ? rawDetails.prettySanctionDate
            : undefined,
        blockchain:
          typeof rawDetails.blockchain === "string"
            ? rawDetails.blockchain
            : undefined,
      }
    : undefined;

  return { isSanctioned: true, details };
}

/**
 * Screen a crypto address against Scorechain's sanctions lists.
 *
 * @throws if the address is empty, the API key is missing, or the request fails / times out / is
 *   rate-limited. Callers must treat a thrown error as "could not screen" and fail-closed.
 */
export async function screenAddress(
  address: string,
): Promise<SanctionScreenResult> {
  const normalized = (address ?? "").trim().toLowerCase();
  if (!normalized) {
    throw new Error("screenAddress: address is required");
  }

  const cached = cache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const apiKey = getApiKey();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(
      `${SCORECHAIN_BASE_URL}/v1/addresses/${encodeURIComponent(normalized)}`,
      {
        method: "GET",
        headers: { "x-api-key": apiKey },
        signal: controller.signal,
      },
    );

    if (res.status === 429) {
      throw new Error("Scorechain rate limit exceeded (429)");
    }
    if (!res.ok) {
      throw new Error(`Scorechain request failed: HTTP ${res.status}`);
    }

    const body = (await res.json()) as unknown;
    const result = parseResponse(body);
    cache.set(normalized, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Scorechain request timed out");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/** Test-only: clear the in-memory cache between cases. */
export function __clearScorechainCache(): void {
  cache.clear();
}
