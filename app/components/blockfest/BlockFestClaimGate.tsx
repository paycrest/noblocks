"use client";
import { useEffect, useRef } from "react";
import { useBlockFestClaim } from "@/app/context/BlockFestClaimContext";

export function BlockFestClaimGate({
  isReferred,
  authenticated,
  ready,
  userAddress,
  onShowModal,
}: {
  isReferred: boolean;
  authenticated: boolean;
  ready: boolean;
  userAddress: string;
  onShowModal: () => void;
}) {
  const { claimed, checkClaim } = useBlockFestClaim();
  const hasCheckedRef = useRef(false);

  // One-time claim check when wallet is ready
  useEffect(() => {
    if (!hasCheckedRef.current && authenticated && ready) {
      if (/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
        hasCheckedRef.current = true;
        checkClaim(userAddress);
      }
    }
  }, [authenticated, ready, userAddress, checkClaim]);

  // Show modal only if referred and not yet claimed
  useEffect(() => {
    if (isReferred && authenticated && ready && claimed === false) {
      const t = setTimeout(onShowModal, 1000);
      return () => clearTimeout(t);
    }
  }, [isReferred, authenticated, ready, claimed, onShowModal]);

  return null;
}
