"use client";

import { useCallback, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { hasEarnConsent, setEarnConsentAccepted } from "../lib/earnConsent";

export type EarnAccessAction = "earn-modal" | "earn-tab" | "earn-hub";

export function useEarnAccess() {
  const { user } = usePrivy();
  const [isConsentModalOpen, setIsConsentModalOpen] = useState(false);
  const pendingRef = useRef<EarnAccessAction | null>(null);

  const runPending = useCallback((onAction: (action: EarnAccessAction) => void) => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) onAction(pending);
  }, []);

  const requestEarnAccess = useCallback(
    (action: EarnAccessAction, onAction: (action: EarnAccessAction) => void) => {
      if (hasEarnConsent(user?.id)) {
        onAction(action);
        return;
      }
      pendingRef.current = action;
      setIsConsentModalOpen(true);
    },
    [user?.id],
  );

  const handleConsentAccepted = useCallback(
    (onAction: (action: EarnAccessAction) => void) => {
      setEarnConsentAccepted(user?.id);
      setIsConsentModalOpen(false);
      runPending(onAction);
    },
    [runPending, user?.id],
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
