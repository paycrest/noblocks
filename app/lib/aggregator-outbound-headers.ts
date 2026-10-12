import "server-only";

import { randomUUID } from "crypto";
import { headers as nextHeaders } from "next/headers";
import tracer from "dd-trace";

export const REQUEST_ID_HEADER = "x-request-id";

type HeaderSource = { get(name: string): string | null };

export function resolveRequestId(incoming?: string | null): string {
  const trimmed = incoming?.trim();
  if (trimmed && trimmed.length > 0 && trimmed.length <= 128) {
    return trimmed;
  }
  return randomUUID();
}

function readIncomingRequestId(source?: HeaderSource): string | null {
  if (!source) return null;
  return (
    source.get(REQUEST_ID_HEADER) ?? source.get("X-Request-ID")
  );
}

/**
 * Headers for outbound aggregator HTTP calls: forwards or mints `X-Request-ID`
 * and injects the active dd-trace span (W3C `traceparent` + Datadog headers).
 */
export async function buildAggregatorOutboundHeaders(
  base: Record<string, string> = {},
  incoming?: HeaderSource,
): Promise<Record<string, string>> {
  const merged: Record<string, string> = { ...base };

  let requestId = readIncomingRequestId(incoming);
  if (!requestId) {
    try {
      const h = await nextHeaders();
      requestId = readIncomingRequestId(h);
    } catch {
      requestId = null;
    }
  }

  merged[REQUEST_ID_HEADER] = resolveRequestId(
    requestId ?? merged[REQUEST_ID_HEADER],
  );

  const span = tracer.scope().active();
  if (span) {
    tracer.inject(span.context(), "http_headers", merged);
  }

  return merged;
}
