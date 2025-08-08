"use client";
import { Suspense, useEffect } from "react";
import { Preloader } from "./components";
import { MainPageContent } from "./components/MainPageContent";
import { useMiniKit } from "@coinbase/onchainkit/minikit";

export default function Page() {
  const { setFrameReady, isFrameReady } = useMiniKit();

  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }

    if (typeof window !== "undefined" && (window as any).farcaster?.actions) {
      (window as any).farcaster.actions.ready();
    }

    console.log("Frame is ready:", isFrameReady);
  }, [setFrameReady, isFrameReady]);

  return (
    <Suspense fallback={<Preloader isLoading={true} />}>
      <MainPageContent />
    </Suspense>
  );
}
