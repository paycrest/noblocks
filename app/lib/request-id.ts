/**
 * Edge-safe request ID helpers (no Node-only imports). Shared by middleware and
 * server outbound header builders.
 */

export const REQUEST_ID_HEADER = "x-request-id";

const REQUEST_ID_MAX_LENGTH = 128;

export function resolveRequestId(incoming?: string | null): string {
  const trimmed = incoming?.trim();
  if (
    trimmed &&
    trimmed.length > 0 &&
    trimmed.length <= REQUEST_ID_MAX_LENGTH
  ) {
    return trimmed;
  }
  return crypto.randomUUID();
}

/** Normalizes an incoming header value for forwarding (mint if missing/invalid). */
export function normalizeRequestIdHeader(
  incoming: string | null | undefined,
): string {
  return resolveRequestId(incoming);
}
