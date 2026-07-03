/**
 * Persists one-time acceptance of the Earn (Vesu / third-party) risk disclosure.
 *
 * Keyed per user: the previous device-global key meant the first account that
 * accepted suppressed the disclosure for every other account on the same
 * device (including brand-new signups). The legacy global key is intentionally
 * ignored so each user confirms the disclosure once themselves.
 */
const EARN_CONSENT_STORAGE_PREFIX = "noblocksEarnConsentAccepted";

function earnConsentKey(userId: string): string {
  return `${EARN_CONSENT_STORAGE_PREFIX}-${userId}`;
}

export function hasEarnConsent(userId: string | undefined): boolean {
  if (typeof window === "undefined" || !userId) return false;
  return localStorage.getItem(earnConsentKey(userId)) === "true";
}

export function setEarnConsentAccepted(userId: string | undefined): void {
  if (typeof window === "undefined" || !userId) return;
  localStorage.setItem(earnConsentKey(userId), "true");
}

/** Earn / Vesu risk disclosure article. */
export const EARN_LEARN_MORE_URL =
  "https://noblocks.xyz/blog/noblocks-earn-feature-disclosure";
