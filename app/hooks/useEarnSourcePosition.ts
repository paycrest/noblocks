"use client";

import { useEffect, useState } from "react";
import {
  readEarnSourcePosition,
  type EarnSourcePosition,
} from "../lib/earnPositionStore";

const EARN_SYNC_EVENT = "noblocks:earn-sync";

/**
 * Reactive read of an EVM-sourced earn position for a specific source chain.
 */
export function useEarnSourcePosition(
  evmAddress: string | undefined,
  sourceChain: string,
  token: string,
): EarnSourcePosition | null {
  const [position, setPosition] = useState<EarnSourcePosition | null>(() =>
    evmAddress ? readEarnSourcePosition(evmAddress, sourceChain, token) : null,
  );

  useEffect(() => {
    if (!evmAddress) {
      setPosition(null);
      return;
    }
    const hydrate = () => {
      setPosition(readEarnSourcePosition(evmAddress, sourceChain, token));
    };
    hydrate();
    window.addEventListener(EARN_SYNC_EVENT, hydrate);
    return () => window.removeEventListener(EARN_SYNC_EVENT, hydrate);
  }, [evmAddress, sourceChain, token]);

  return position;
}
