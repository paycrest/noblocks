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

/** Earn / Vesu risk disclosure article. */
export const EARN_LEARN_MORE_URL =
  "https://docs.google.com/document/d/13_C1VoNiWXl0gOzcLGuOF_sz_2dEKhuKkIAjwfzC654/edit?tab=t.0#heading=h.vabjr2kta3us";
