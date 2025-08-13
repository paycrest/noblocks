"use client";
import { Suspense, useEffect } from "react";
import { Preloader } from "./components";
import { MainPageContent } from "./components/MainPageContent";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
// import { sdk } from "@farcaster/miniapp-sdk";

export default function Page() {
  const { setFrameReady, isFrameReady } = useMiniKit();

  useEffect(() => {
    const markReady = async () => {
      if (!isFrameReady) {
        setFrameReady();
      }
      try {
        // const { sdk } = await import("@farcaster/miniapp-sdk");
        // await sdk.actions.ready();
        // console.log("Mini-app ready signal sent to Farcaster.");

        if (
          typeof window !== "undefined" &&
          (window as any).__farcasterMiniAppReady
        ) {
          return;
        }
        const { sdk } = await import("@farcaster/miniapp-sdk");
        await sdk.actions.ready();
        if (typeof window !== "undefined") {
          (window as any).__farcasterMiniAppReady = true;
        }
      } catch (err) {
        console.error("Failed to signal ready:", err);
      }
    };

    markReady();
  }, [setFrameReady, isFrameReady]);

  return (
    <Suspense fallback={<Preloader isLoading={true} />}>
      {/* <MainPageContent onReady={handleContentReady} /> */}
      <MainPageContent />
    </Suspense>
  );
}
