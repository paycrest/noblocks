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

/**
 * Customer-facing explanation of why an on-ramp deposit went back to the account it came from,
 * from the aggregator's `refundReason`; undefined for any other refund. `inProgress` words it
 * for a refund still being sent.
 */
export function onrampRefundExplanation(
  refundReason: string | undefined,
  options?: { inProgress?: boolean },
): string | undefined {
  const inProgress = options?.inProgress === true;
  switch (refundReason) {
    case "payer_mismatch":
      return inProgress
        ? "It came from a bank account not in your name, so it's being sent back to that account."
        : "Your payment came from a bank account not in your name, so it was sent back to that account. To buy, pay from a bank account in your own name.";
    case "payer_unverified":
      return inProgress
        ? "We couldn't confirm who sent it, so it's being sent back to the account it came from."
        : "We couldn't confirm who sent your payment, so it was sent back to the account it came from. To buy, pay from a bank account in your own name.";
    default:
      return undefined;
  }
}
