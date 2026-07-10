/**
 * Persists one-time acceptance of the Convert (Li.Fi / Near Intents
 * third-party bridge) risk disclosure. Keyed per user for the same reason as
 * earnConsent.ts: a device-global key would let the first account that
 * accepted suppress the disclosure for every other account on the device.
 */
const BRIDGE_CONSENT_STORAGE_PREFIX = "noblocksBridgeConsentAccepted";

// localStorage can throw (private browsing, blocked third-party storage,
// quota). Consent accepted while persistence is unavailable is kept here so
// the flow still proceeds for the rest of the session.
const sessionConsent = new Set<string>();

function bridgeConsentKey(userId: string): string {
  return `${BRIDGE_CONSENT_STORAGE_PREFIX}-${userId}`;
}

export function hasBridgeConsent(userId: string | undefined): boolean {
  if (typeof window === "undefined" || !userId) return false;
  const key = bridgeConsentKey(userId);
  if (sessionConsent.has(key)) return true;
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

export function setBridgeConsentAccepted(userId: string | undefined): void {
  if (typeof window === "undefined" || !userId) return;
  const key = bridgeConsentKey(userId);
  sessionConsent.add(key);
  try {
    localStorage.setItem(key, "true");
  } catch {
    // persistence unavailable — sessionConsent above keeps this session going
  }
}
