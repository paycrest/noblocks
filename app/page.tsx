"use client";
import { Suspense } from "react";
import { Preloader } from "./components";
import { MainPageContent } from "./components/MainPageContent";
import { useEffect } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";

export default function Page() {
  const { setFrameReady, isFrameReady } = useMiniKit();

  // The setFrameReady() function is called when your mini-app is ready to be shown
  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);
  return (
    <Suspense fallback={<Preloader isLoading={true} />}>
      <MainPageContent />
    </Suspense>
  );
}
