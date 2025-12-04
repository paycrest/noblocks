"use client";
import { useEffect } from "react";
import { sdk } from "@farcaster/miniapp-sdk";

export function EarlyReady() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      !(window as any).__farcasterMiniAppReady
    ) {
      // Notify Farcaster SDK
      sdk.actions.ready();

      // Defensive fallback for iframe hosts
      try {
        if (window.parent && window.top !== window.self) {
          const msgs = [
            { type: "farcaster:ready" },
            { type: "miniapp:ready" },
            { type: "frame:ready" },
            { type: "farcaster:miniapp:ready" },
          ];
          msgs.forEach((m) => {
            window.parent!.postMessage(m, "*");
          });
        }
      } catch {}

      (window as any).__farcasterMiniAppReady = true;
    }
  }, []);

  return null;
}
