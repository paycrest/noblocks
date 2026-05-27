/** Persists one-time acceptance of the Earn (Vesu / third-party) risk disclosure. */
const EARN_CONSENT_STORAGE_KEY = "noblocksEarnConsentAccepted";

export function hasEarnConsent(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(EARN_CONSENT_STORAGE_KEY) === "true";
}

export function setEarnConsentAccepted(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(EARN_CONSENT_STORAGE_KEY, "true");
}

/** Vesu product overview. */
export const EARN_LEARN_MORE_URL = "https://vesu.xyz";
