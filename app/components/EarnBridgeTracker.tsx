"use client";

import { useEarnBridgeStatusTracker } from "../hooks/useEarnBridgeStatusTracker";

/** Mount once inside app providers to resume in-flight EVM earn bridges. */
export function EarnBridgeTracker() {
  useEarnBridgeStatusTracker();
  return null;
}
