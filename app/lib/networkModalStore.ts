import { useSyncExternalStore } from "react";

const NETWORK_MODAL_STORAGE_KEY_PREFIX = "hasSeenNetworkModal-";

// localStorage can throw in restricted environments (storage disabled,
// private modes, quota); modal gating must degrade gracefully, not crash.
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
 * Canonical "has seen the network modal" persistence. New keys are written
 * lowercased; reads scan for a case-insensitive key match, so legacy keys
 * written with any historical address casing (e.g. EIP-55 checksummed) are
 * honored regardless of the casing the caller's address arrives in.
 */
export function hasSeenNetworkModalFlag(
  walletAddress: string | undefined,
): boolean {
  if (typeof window === "undefined" || !walletAddress) return false;
  const target =
    `${NETWORK_MODAL_STORAGE_KEY_PREFIX}${walletAddress}`.toLowerCase();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.toLowerCase() === target) return true;
    }
  } catch {
    // ignore storage errors — treat as not seen
  }
  return false;
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

/** Removes the seen flag in any historical casing (e.g. fresh-signup reset). */
export function clearNetworkModalSeen(
  walletAddress: string | undefined,
): void {
  if (typeof window === "undefined" || !walletAddress) return;
  const target =
    `${NETWORK_MODAL_STORAGE_KEY_PREFIX}${walletAddress}`.toLowerCase();
  const toRemove: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.toLowerCase() === target) toRemove.push(key);
    }
  } catch {
    // ignore storage errors
  }
  toRemove.forEach(safeRemoveItem);
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
