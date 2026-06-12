/**
 * Carries a referral code from a share link (`?ref=NBXXXX`, see
 * `handleCopyLink` in app/utils.ts) through the signup/login flow, so the
 * referral modal can pre-fill it instead of making the user type it manually.
 * Persisted in localStorage because OAuth logins can navigate away and drop
 * the query string before the (post-auth) referral modal ever opens.
 */
export const REFERRAL_CODE_PATTERN = /^NB[A-Z0-9]{4}$/;

const PENDING_REFERRAL_CODE_KEY = "pendingReferralCode";

function normalize(raw: string | null | undefined): string | null {
  const code = raw?.trim().toUpperCase();
  // BlockFest links use ?ref=blockfest — it doesn't match the NBxxxx format,
  // so the pattern check keeps the two flows apart.
  return code && REFERRAL_CODE_PATTERN.test(code) ? code : null;
}

export function storePendingReferralCode(raw: string | null | undefined): void {
  const code = normalize(raw);
  if (!code || typeof window === "undefined") return;
  try {
    localStorage.setItem(PENDING_REFERRAL_CODE_KEY, code);
  } catch {
    // ignore storage errors
  }
}

export function readPendingReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return normalize(localStorage.getItem(PENDING_REFERRAL_CODE_KEY));
  } catch {
    return null;
  }
}

export function clearPendingReferralCode(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(PENDING_REFERRAL_CODE_KEY);
  } catch {
    // ignore storage errors
  }
}
