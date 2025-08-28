import { Suspense } from "react";
import { Preloader } from "./components";
import { MainPageContent } from "./components/MainPageContent";
import { Metadata } from "next";
import config from "./lib/config";

export const metadata: Metadata = {
  title: {
    default: "Noblocks - Decentalized Payments Interface",
    template: "%s | Noblocks",
  },
  description:
    "The first interface for decentralized payments to any bank or mobile wallet, powered by a distributed network of liquidity nodes.",
};

export default function Page() {
  return (
    <Suspense fallback={<Preloader isLoading={true} />}>
      <MainPageContent />
    </Suspense>
  );
}
