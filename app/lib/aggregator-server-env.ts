import "server-only";

/** Read at request time — avoids stale module-level config when env changes. */
export function getAggregatorSenderApiKeyId(): string {
  return (
    process.env.AGGREGATOR_SENDER_API_KEY_ID ||
    process.env.NEXT_PUBLIC_AGGREGATOR_SENDER_API_KEY_ID ||
    ""
  ).trim();
}

/** Base origin for v2 routes, e.g. `https://staging-api.paycrest.io`. */
export function getAggregatorBaseUrlForV2(): string {
  const raw = (
    process.env.AGGREGATOR_URL ||
    process.env.NEXT_PUBLIC_AGGREGATOR_URL ||
    ""
  ).trim();
  if (!raw) return "";
  return raw.replace(/\/+$/, "").replace(/\/v1$/i, "");
}

/** Safe dev log fragment: first 8 chars of UUID. */
export function aggregatorApiKeyLogPrefix(apiKeyId: string): string {
  const trimmed = apiKeyId.trim();
  if (trimmed.length < 8) return "(empty or too short)";
  return `${trimmed.slice(0, 8)}…`;
}

export function aggregatorApiKeyNotFoundHint(aggregatorV2Url: string): string {
  const host = aggregatorV2Url.toLowerCase();
  if (host.includes("api.paycrest.io") && !host.includes("staging")) {
    return (
      "API key not found on production. Staging sender keys only work with " +
      "NEXT_PUBLIC_AGGREGATOR_URL=https://staging-api.paycrest.io/v1"
    );
  }
  if (host.includes("staging")) {
    return (
      "API key not found on staging. Confirm NEXT_PUBLIC_AGGREGATOR_SENDER_API_KEY_ID " +
      "(or AGGREGATOR_SENDER_API_KEY_ID) is a sender key UUID from the staging dashboard."
    );
  }
  return (
    "API key not found. Confirm the sender key UUID matches the aggregator host in " +
    "NEXT_PUBLIC_AGGREGATOR_URL."
  );
}
