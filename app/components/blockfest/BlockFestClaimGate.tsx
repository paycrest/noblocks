"use client";
import { useEffect, useRef } from "react";
import { useBlockFestClaim } from "@/app/context/BlockFestClaimContext";
import { isBlockFestActive } from "../../utils";

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
  const hasShownModalRef = useRef(false);

  // One-time claim check when wallet is ready
  useEffect(() => {
    if (isBlockFestActive() && !hasCheckedRef.current && authenticated && ready && userAddress) {
      if (/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
        hasCheckedRef.current = true;
        checkClaim(userAddress);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, ready, userAddress]);

  // Reset refs when user logs out
  useEffect(() => {
    if (!authenticated) {
      hasCheckedRef.current = false;
      hasShownModalRef.current = false;
    }
  }, [authenticated]);

  // Show modal only once if referred and not yet claimed
  useEffect(() => {
    if (
      isBlockFestActive() &&
      !hasShownModalRef.current &&
      isReferred &&
      authenticated &&
      ready &&
      claimed === false
    ) {
      hasShownModalRef.current = true;
      const t = setTimeout(onShowModal, 1000);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReferred, authenticated, ready, claimed]);

  return null;
}
