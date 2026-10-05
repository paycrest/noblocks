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

/**
 * Sender-API sells report these before the on-chain order exists: `initiated` while the deposit is
 * awaited, `deposited` once it has arrived. The status UI has no separate state for them, so
 * callers show them as pending.
 */
const AWAITING_ORDER_STATUSES = new Set(["initiated", "deposited"]);

export function isAwaitingOrderStatus(status: unknown): boolean {
  return (
    typeof status === "string" &&
    AWAITING_ORDER_STATUSES.has(status.toLowerCase())
  );
}
