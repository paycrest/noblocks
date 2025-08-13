"use client";

import { useEffect } from "react";

export function EarlyReady() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Ensure we signal ready only once app-wide
        if (
          typeof window !== "undefined" &&
          (window as any).__farcasterMiniAppReady
        ) {
          return;
        }
        const { sdk } = await import("@farcaster/miniapp-sdk");
        if (cancelled) return;
        await sdk.actions.ready();
        if (typeof window !== "undefined") {
          (window as any).__farcasterMiniAppReady = true;
        }
        console.log("✅ Mini-app early ready signal sent");
      } catch (err) {
        console.error("❌ Early ready failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
