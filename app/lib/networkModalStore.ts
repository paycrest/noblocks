import { useSyncExternalStore } from "react";

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

/** Reactive hook — re-renders the component the instant markNetworkModalDismissed() is called. */
export function useIsNetworkModalDismissed() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
