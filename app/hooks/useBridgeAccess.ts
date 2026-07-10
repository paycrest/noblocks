"use client";

import { useCallback, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { hasBridgeConsent, setBridgeConsentAccepted } from "../lib/bridgeConsent";

/**
 * First-time Convert gate (same architecture as useEarnAccess): wrap the
 * action that opens the convert/bridge flow in requestBridgeAccess — users
 * who already accepted the disclosure pass straight through, everyone else
 * sees the Terms of use modal first and the action runs on acceptance.
 */
export function useBridgeAccess() {
  const { user } = usePrivy();
  const [isConsentModalOpen, setIsConsentModalOpen] = useState(false);
  const pendingRef = useRef<(() => void) | null>(null);

  const requestBridgeAccess = useCallback(
    (proceed: () => void) => {
      if (hasBridgeConsent(user?.id)) {
        proceed();
        return;
      }
      pendingRef.current = proceed;
      setIsConsentModalOpen(true);
    },
    [user?.id],
  );

  const handleConsentAccepted = useCallback(() => {
    setBridgeConsentAccepted(user?.id);
    setIsConsentModalOpen(false);
    const pending = pendingRef.current;
    pendingRef.current = null;
    pending?.();
  }, [user?.id]);

  const dismissConsent = useCallback(() => {
    pendingRef.current = null;
    setIsConsentModalOpen(false);
  }, []);

  return {
    isConsentModalOpen,
    requestBridgeAccess,
    handleConsentAccepted,
    dismissConsent,
  };
}
