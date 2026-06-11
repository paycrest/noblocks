import { useSyncExternalStore } from "react";

const NETWORK_MODAL_STORAGE_KEY_PREFIX = "hasSeenNetworkModal-";

// localStorage can throw in restricted environments (storage disabled,
// private modes, quota); modal gating must degrade gracefully, not crash.
function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage errors
  }
}

function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore storage errors
  }
}

/**
 * Canonical "has seen the network modal" persistence. The key is lowercased:
 * the modal used to write the checksummed address while MigrationContext and
 * session-cleanup read/removed the lowercased form, so they never matched.
 * Legacy checksummed keys are still honored on read.
 */
export function hasSeenNetworkModalFlag(
  walletAddress: string | undefined,
): boolean {
  if (typeof window === "undefined" || !walletAddress) return false;
  return (
    safeGetItem(
      `${NETWORK_MODAL_STORAGE_KEY_PREFIX}${walletAddress.toLowerCase()}`,
    ) !== null ||
    safeGetItem(`${NETWORK_MODAL_STORAGE_KEY_PREFIX}${walletAddress}`) !== null
  );
}

export function markNetworkModalSeen(
  walletAddress: string | undefined,
): void {
  if (typeof window === "undefined" || !walletAddress) return;
  safeSetItem(
    `${NETWORK_MODAL_STORAGE_KEY_PREFIX}${walletAddress.toLowerCase()}`,
    "true",
  );
}

/** Removes both canonical and legacy key forms (e.g. fresh-signup reset). */
export function clearNetworkModalSeen(
  walletAddress: string | undefined,
): void {
  if (typeof window === "undefined" || !walletAddress) return;
  safeRemoveItem(
    `${NETWORK_MODAL_STORAGE_KEY_PREFIX}${walletAddress.toLowerCase()}`,
  );
  safeRemoveItem(`${NETWORK_MODAL_STORAGE_KEY_PREFIX}${walletAddress}`);
}

let dismissed = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return dismissed;
}

/** Call from NetworkSelectionModal.handleClose to notify subscribers synchronously. */
export function markNetworkModalDismissed() {
  dismissed = true;
  listeners.forEach((fn) => fn());
}

/** Reset on logout so the next user must interact with the network modal themselves. */
export function resetNetworkModalDismissed() {
  dismissed = false;
  listeners.forEach((fn) => fn());
}

/** Reactive hook — re-renders the component the instant markNetworkModalDismissed() is called. */
export function useIsNetworkModalDismissed() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
