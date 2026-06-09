import { Metadata } from "next";
import KycClient from "./kyc-client";

export const metadata: Metadata = {
  title: "KYC Policy | Noblocks",
  description:
    "KYC Policy for Noblocks - Learn how we collect, verify, and protect your identity information when using our decentralized payments service.",
  keywords: [
    "kyc policy",
    "know your customer",
    "identity verification",
    "noblocks kyc",
    "crypto kyc",
    "stablecoin kyc",
    "decentralized payment kyc",
    "compliance policy",
  ],
  openGraph: {
    title: "KYC Policy | Noblocks",
    description:
      "KYC Policy for Noblocks - Learn how we collect, verify, and protect your identity information when using our decentralized payments service.",
    url: "https://noblocks.xyz/kyc-policy",
    type: "website",
    images: [
      {
        url: "https://noblocks.xyz/images/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Noblocks KYC Policy",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "KYC Policy | Noblocks",
    description:
      "KYC Policy for Noblocks - Learn how we collect, verify, and protect your identity information when using our decentralized payments service.",
  },
  alternates: {
    canonical: "https://noblocks.xyz/kyc-policy",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function KycPolicyPage() {
  return <KycClient />;
}
