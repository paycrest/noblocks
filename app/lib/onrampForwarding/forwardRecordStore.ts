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

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage errors — caller degrades to balance-based inference
  }
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
    const parsed = JSON.parse(raw) as Partial<ForwardRecord>;
    if (
      parsed &&
      parsed.orderId === orderId &&
      typeof parsed.status === "string"
    ) {
      return parsed as ForwardRecord;
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
  safeSet(keyFor(orderId), JSON.stringify(next));
  return next;
}

export function clearForwardRecord(orderId: string): void {
  if (typeof window === "undefined" || !orderId) return;
  safeRemove(keyFor(orderId));
}
