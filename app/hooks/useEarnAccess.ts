"use client";

import { useCallback, useRef, useState } from "react";
import { hasEarnConsent, setEarnConsentAccepted } from "../lib/earnConsent";

export type EarnAccessAction = "earn-modal" | "earn-tab" | "earn-hub";

export function useEarnAccess() {
  const [isConsentModalOpen, setIsConsentModalOpen] = useState(false);
  const pendingRef = useRef<EarnAccessAction | null>(null);

  const runPending = useCallback((onAction: (action: EarnAccessAction) => void) => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) onAction(pending);
  }, []);

  const requestEarnAccess = useCallback(
    (action: EarnAccessAction, onAction: (action: EarnAccessAction) => void) => {
      if (hasEarnConsent()) {
        onAction(action);
        return;
      }
      pendingRef.current = action;
      setIsConsentModalOpen(true);
    },
    [],
  );

  const handleConsentAccepted = useCallback(
    (onAction: (action: EarnAccessAction) => void) => {
      setEarnConsentAccepted();
      setIsConsentModalOpen(false);
      runPending(onAction);
    },
    [runPending],
  );

  const dismissConsent = useCallback(() => {
    pendingRef.current = null;
    setIsConsentModalOpen(false);
  }, []);

  return {
    isConsentModalOpen,
    requestEarnAccess,
    handleConsentAccepted,
    dismissConsent,
  };
}
