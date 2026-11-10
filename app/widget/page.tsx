"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import { WidgetFormSkeleton } from "../components/WidgetFormSkeleton";

// Same content as the home page — EmbedContext + AppLayout key off the
// /widget pathname to render the compact chrome-less widget shell. All home
// query params (token, currency, tokenAmount, fiatAmount, side, provider,
// injected, ref) work here unchanged.
const MainPageContent = dynamic(
  () =>
    import("../components/MainPageContent").then((mod) => ({
      default: mod.MainPageContent,
    })),
  {
    ssr: false,
    loading: () => <WidgetFormSkeleton />,
  },
);

export default function WidgetPage() {
  return (
    <Suspense fallback={<WidgetFormSkeleton />}>
      <MainPageContent />
    </Suspense>
  );
}
