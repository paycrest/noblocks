/**
 * Persists one-time acceptance of the Convert (Li.Fi / Near Intents
 * third-party bridge) risk disclosure. Keyed per user for the same reason as
 * earnConsent.ts: a device-global key would let the first account that
 * accepted suppress the disclosure for every other account on the device.
 */
const BRIDGE_CONSENT_STORAGE_PREFIX = "noblocksBridgeConsentAccepted";

function bridgeConsentKey(userId: string): string {
  return `${BRIDGE_CONSENT_STORAGE_PREFIX}-${userId}`;
}

export function hasBridgeConsent(userId: string | undefined): boolean {
  if (typeof window === "undefined" || !userId) return false;
  return localStorage.getItem(bridgeConsentKey(userId)) === "true";
}

export function setBridgeConsentAccepted(userId: string | undefined): void {
  if (typeof window === "undefined" || !userId) return;
  localStorage.setItem(bridgeConsentKey(userId), "true");
}
