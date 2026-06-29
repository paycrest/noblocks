"use client";

import { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useWalletAddress } from "@/app/hooks/useWalletAddress";
import { updateBridgeTransactionStatus } from "@/app/api/aggregator";
import { NearIntentsClient, LifiClient } from "@/app/lib/bridge";
import type { BridgeEngine } from "@/app/lib/bridge";

const nearClient = new NearIntentsClient();
const lifiClient = new LifiClient();

export interface BridgeSubmitInfo {
  savedTxId: string;
  engine: BridgeEngine;
  depositRefId: string;
}

const STORAGE_KEY = "noblocks_pending_bridges";

function loadPendingBridges(): BridgeSubmitInfo[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function savePendingBridges(bridges: BridgeSubmitInfo[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bridges));
  } catch {
    // ignore
  }
}

/**
 * Tracks bridge transactions and polls their status until completion.
 * Persists pending bridges in localStorage so polling continues even if the user closes the modal.
 */
export function useBridgeStatusTracker() {
  const { getAccessToken } = usePrivy();
  const walletAddress = useWalletAddress();
  const [pendingBridges, setPendingBridges] = useState<BridgeSubmitInfo[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);

  // Load pending bridges on mount
  useEffect(() => {
    setPendingBridges(loadPendingBridges());
  }, []);

  // Save to localStorage whenever pendingBridges changes
  useEffect(() => {
    savePendingBridges(pendingBridges);
  }, [pendingBridges]);

  // Poll pending bridges
  useEffect(() => {
    if (!walletAddress || pendingBridges.length === 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const poll = async () => {
      if (isPollingRef.current) return;
      isPollingRef.current = true;
      try {
      const token = await getAccessToken();
      if (!token) return;

      const updatedBridges = [...pendingBridges];
      let hasChanges = false;

      for (let i = 0; i < updatedBridges.length; i++) {
        const bridge = updatedBridges[i];
        try {
          const status =
            bridge.engine === "near"
              ? await nearClient.getStatus(bridge.depositRefId, token)
              : await lifiClient.getStatus(bridge.depositRefId, token);

          if (status.status === "SUCCESS") {
            await updateBridgeTransactionStatus(
              bridge.savedTxId,
              "completed",
              token,
              walletAddress
            );
            updatedBridges.splice(i, 1);
            i--;
            hasChanges = true;
          } else if (status.status === "REFUNDED") {
            await updateBridgeTransactionStatus(
              bridge.savedTxId,
              "refunded",
              token,
              walletAddress
            );
            updatedBridges.splice(i, 1);
            i--;
            hasChanges = true;
          } else if (status.status === "FAILED") {
            await updateBridgeTransactionStatus(
              bridge.savedTxId,
              "failed",
              token,
              walletAddress
            );
            updatedBridges.splice(i, 1);
            i--;
            hasChanges = true;
          }
        } catch (error) {
          // Keep polling on error
          console.error("Bridge status poll error:", error);
        }
      }

      if (hasChanges) {
        setPendingBridges(updatedBridges);
      }
      } finally {
        isPollingRef.current = false;
      }
    };

    // Poll immediately
    poll();

    // Then poll every 10 seconds
    intervalRef.current = setInterval(poll, 10000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [walletAddress, getAccessToken, pendingBridges]);

  const trackBridge = (info: BridgeSubmitInfo) => {
    setPendingBridges((prev) => [...prev, info]);
  };

  return { trackBridge, pendingBridges };
}
