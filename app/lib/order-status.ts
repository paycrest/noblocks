/**
 * Aggregator order statuses that may flow into transaction-status state/persistence. Envelope
 * fallbacks can surface `"success"`/`"error"` (the HTTP envelope, not an order status) — callers
 * must skip those instead of rendering or persisting them.
 */
const KNOWN_AGGREGATOR_ORDER_STATUSES = new Set([
  "pending",
  "fulfilling",
  "fulfilled",
  "validated",
  "settling",
  "settled",
  "refunding",
  "refunded",
  "expired",
]);

export function isKnownAggregatorOrderStatus(
  status: unknown,
): status is string {
  return (
    typeof status === "string" &&
    KNOWN_AGGREGATOR_ORDER_STATUSES.has(status.toLowerCase())
  );
}
