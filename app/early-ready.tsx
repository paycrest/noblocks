"use client";
import { useEffect } from "react";
import { sdk } from "@farcaster/miniapp-sdk";

/**
 * Early bootstrap component for Farcaster/Base App mini apps
 * Follows Farcaster docs pattern with /mini pathname check for mobile compatibility
 * Always calls ready() unconditionally (required for Base App preview tools)
 */
export function EarlyReady() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if already initialized
    if ((window as any).__farcasterMiniAppReady) return;

    // Check for mini app conditions (Farcaster docs pattern + Base App)
    const url = new URL(window.location.href);
    const isMini =
      url.pathname.startsWith("/mini") ||
      url.searchParams.get("miniApp") === "true" ||
      url.searchParams.get("mini") === "true" ||
      url.searchParams.get("baseApp") === "true" ||
      !!(window as any).minikit || // Base App MiniKit
      window.navigator?.userAgent?.toLowerCase().includes("baseapp") ||
      window.navigator?.userAgent?.toLowerCase().includes("farcaster") ||
      window.navigator?.userAgent?.toLowerCase().includes("warpcast") ||
      window.top !== window.self; // In iframe

    
    if (isMini || true) { // Always call for Base App compatibility
      try {
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
        } catch { }

        (window as any).__farcasterMiniAppReady = true;
      } catch (error) {
        // May fail if not in actual mini app environment (expected)
        console.warn("[EarlyReady] SDK ready() call failed (expected outside mini app):", error);
      }
    }
  }, []);

  return null;
}
