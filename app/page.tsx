import { Suspense } from "react";
import { Preloader } from "./components";
import { MainPageContent } from "./components/MainPageContent";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Noblocks - Decentralized Payments Interface",
  description:
    "The first interface for decentralized payments to any bank or mobile wallet, powered by a distributed network of liquidity nodes. Send USDC, USDT, and DAI to any bank account or mobile wallet globally.",
  keywords: [
    "stablecoin payments",
    "USDC to bank transfer", 
    "USDT to mobile money",
    "crypto remittance",
    "decentralized payments",
    "cross-border payments",
    "instant crypto transfer",
    "low fee remittance",
    "crypto to fiat",
    "stablecoin to bank"
  ],
  openGraph: {
    title: "Noblocks - Decentralized Payments Interface",
    description: "Send stablecoins to any bank or mobile wallet globally. USDC, USDT, and DAI payments with instant settlement.",
    url: "https://noblocks.xyz",
    type: "website",
    images: [
      {
        url: "https://noblocks.xyz/images/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Noblocks - Send stablecoins to any bank or mobile wallet"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Noblocks - Decentralized Payments Interface",
    description: "Send stablecoins to any bank or mobile wallet globally. USDC, USDT, and DAI payments with instant settlement.",
    images: ["https://noblocks.xyz/images/og-image.jpg"]
  },
  alternates: {
    canonical: "https://noblocks.xyz"
  }
};

export default function Page() {
  return (
    <Suspense fallback={<Preloader isLoading={true} />}>
      <MainPageContent />
    </Suspense>
  );
}
