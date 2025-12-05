"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { sdk } from "@farcaster/miniapp-sdk";

/**
 * Custom hook to detect if the app is in mini mode (Farcaster Mini App)
 * Uses the official Farcaster SDK method for reliable detection
 * @see https://miniapps.farcaster.xyz/docs/sdk/is-in-mini-app
 * @returns boolean indicating if mini mode is active
 */
export function useMiniMode(): boolean {
  const searchParams = useSearchParams();
  const [isMiniApp, setIsMiniApp] = useState(false);

  useEffect(() => {
    // Check for explicit mini mode query parameter (for testing)
    if (searchParams.get("mini") === "true") {
      setIsMiniApp(true);
      return;
    }

    // Use official Farcaster SDK method for detection
    // This is the recommended way to detect Mini App environments
    // https://miniapps.farcaster.xyz/docs/sdk/is-in-mini-app
    sdk.isInMiniApp()
      .then((result) => {
        setIsMiniApp(result);
      })
      .catch(() => {
        // Fallback to false if detection fails
        setIsMiniApp(false);
      });
  }, [searchParams]);

  return isMiniApp;
}
