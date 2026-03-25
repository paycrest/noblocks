"use client";

import { Suspense } from "react";
import { Preloader } from "./components";
import dynamic from "next/dynamic";

// Use dynamic import to avoid SSR issues
const MainPageContent = dynamic(() => import("./components/MainPageContent").then(mod => ({ default: mod.MainPageContent })), {
  ssr: false,
  loading: () => <Preloader isLoading={true} />
});

export default function Page() {
  return (
    <Suspense fallback={<Preloader isLoading={true} />}>
      <MainPageContent />
    </Suspense>
  );
}
