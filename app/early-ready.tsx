"use client";

import { useEffect } from "react";
import { sdk } from "@farcaster/miniapp-sdk";

export function EarlyReady() {
  useEffect(() => {
    (async () => {
      try {
        await sdk.actions.ready();
        console.log("✅ Mini-app early ready signal sent");
      } catch (err) {
        console.error("❌ Early ready failed", err);
      }
    })();
  }, []);

  return null;
}
