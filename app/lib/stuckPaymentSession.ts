import type { TransactionStatusType } from "../types";

const SESSION_KEY = "noblocks_stuck_payment_session";

export type StuckPaymentFormSnapshot = {
  amountSent: number;
  amountReceived: number;
  token: string;
  currency: string;
  institution: string;
  recipientName: string;
  accountIdentifier: string;
  accountType?: "bank" | "mobile_money";
  walletAddress?: string;
  memo?: string;
  swapMode?: "onramp" | "offramp";
};

export type StuckPaymentSession = {
  orderId: string;
  transactionId?: string;
  createdAt: string;
  transactionStatus: Extract<
    TransactionStatusType,
    "fulfilling" | "fulfilled"
  >;
  isOnramp: boolean;
  network?: string;
  txHash?: string;
  form: StuckPaymentFormSnapshot;
  savedAt: number;
};

function isStuckStatus(
  status: string,
): status is StuckPaymentSession["transactionStatus"] {
  return status === "fulfilling" || status === "fulfilled";
}

export function readStuckPaymentSession(): StuckPaymentSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StuckPaymentSession;
    if (
      !parsed?.orderId ||
      !parsed?.createdAt ||
      !isStuckStatus(parsed.transactionStatus) ||
      !parsed?.form
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeStuckPaymentSession(
  session: Omit<StuckPaymentSession, "savedAt">,
): void {
  if (typeof window === "undefined") return;
  if (!isStuckStatus(session.transactionStatus)) return;
  try {
    const payload: StuckPaymentSession = {
      ...session,
      savedAt: Date.now(),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / private browsing
  }
}

export function clearStuckPaymentSession(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

/** Clears per-order stuck timer keys used by the confirmation delay. */
export function clearStuckFulfillingSince(orderId?: string | null): void {
  if (typeof window === "undefined" || !orderId) return;
  try {
    localStorage.removeItem(`stuck_fulfilling_since_${orderId}`);
  } catch {
    // ignore
  }
}

export function resetStuckFulfillingSince(orderId: string): void {
  if (typeof window === "undefined" || !orderId) return;
  try {
    localStorage.setItem(`stuck_fulfilling_since_${orderId}`, String(Date.now()));
  } catch {
    // ignore
  }
}
