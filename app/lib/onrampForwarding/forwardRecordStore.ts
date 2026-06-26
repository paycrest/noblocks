import type { ForwardRecord, ForwardStatus } from "./decideForwardAction";

/**
 * Durable (localStorage) persistence for onramp leg-2 forwarding state, keyed by orderId.
 * This is what makes leg 2 idempotent and resumable across reloads/tabs within a browser.
 * Every access is wrapped in try/catch so disabled/quota-exceeded storage (private mode) degrades
 * gracefully — a missing record just falls back to on-chain balance inference.
 */

const KEY_PREFIX = "onrampForward-";

const keyFor = (orderId: string) => `${KEY_PREFIX}${orderId}`;

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Returns whether the write actually persisted, so callers can refuse to forward without it. */
function safeSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    // storage disabled / quota exceeded — caller must NOT proceed as if the claim was durable
    return false;
  }
}

const VALID_STATUSES: ReadonlySet<ForwardStatus> = new Set<ForwardStatus>([
  "pending",
  "forwarding",
  "completed",
  "skipped",
  "failed",
]);

/** A persisted record is only trusted when every required field is present and well-typed. */
function isValidRecord(value: unknown): value is ForwardRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.orderId === "string" &&
    typeof r.destination === "string" &&
    typeof r.token === "string" &&
    typeof r.amountWei === "string" &&
    typeof r.updatedAt === "number" &&
    VALID_STATUSES.has(r.status as ForwardStatus) &&
    (r.txHash === undefined || typeof r.txHash === "string")
  );
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore storage errors
  }
}

export function getForwardRecord(orderId: string): ForwardRecord | null {
  if (typeof window === "undefined" || !orderId) return null;
  const raw = safeGet(keyFor(orderId));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isValidRecord(parsed) && parsed.orderId === orderId) {
      return parsed;
    }
  } catch {
    // corrupt entry — treat as absent
  }
  return null;
}

/**
 * Create or update the record for an order. Unspecified fields are carried over from the previous
 * record; `status` is required. `updatedAt` is stamped to now on every write (drives staleness).
 */
export function upsertForwardRecord(
  orderId: string,
  patch: Partial<Omit<ForwardRecord, "orderId" | "updatedAt">> & {
    status: ForwardStatus;
  },
): ForwardRecord | null {
  if (typeof window === "undefined" || !orderId) return null;
  const prev = getForwardRecord(orderId);
  const next: ForwardRecord = {
    orderId,
    destination: patch.destination ?? prev?.destination ?? "",
    token: patch.token ?? prev?.token ?? "",
    amountWei: patch.amountWei ?? prev?.amountWei ?? "0",
    status: patch.status,
    txHash: patch.txHash ?? prev?.txHash,
    updatedAt: Date.now(),
  };
  // Only report success when the record actually persisted — otherwise the caller must not treat
  // the claim as durable (a reload could resubmit an in-flight transfer).
  return safeSet(keyFor(orderId), JSON.stringify(next)) ? next : null;
}

export function clearForwardRecord(orderId: string): void {
  if (typeof window === "undefined" || !orderId) return;
  safeRemove(keyFor(orderId));
}
