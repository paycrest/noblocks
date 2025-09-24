import { Metadata } from "next";
import TermsClient from "./terms-client";

export const metadata: Metadata = {
  title: "Terms of Use | Noblocks",
  description:
    "Terms of Use for Noblocks - Read our terms and conditions for using our decentralized payments service. Learn about our stablecoin payment platform terms.",
  keywords: [
    "terms of use",
    "terms and conditions", 
    "noblocks terms",
    "stablecoin payment terms",
    "crypto service terms",
    "decentralized payment terms"
  ],
  openGraph: {
    title: "Terms of Use | Noblocks",
    description:
      "Terms of Use for Noblocks - Read our terms and conditions for using our decentralized payments service.",
    url: "https://noblocks.xyz/terms",
    type: "website",
    images: [
      {
        url: "https://noblocks.xyz/images/og-terms.jpg",
        width: 1200,
        height: 630,
        alt: "Noblocks Terms of Use"
      }
    ]
  },
  twitter: {
    card: "summary",
    title: "Terms of Use | Noblocks",
    description:
      "Terms of Use for Noblocks - Read our terms and conditions for using our decentralized payments service.",
  },
  alternates: {
    canonical: "https://noblocks.xyz/terms"
  },
  robots: {
    index: true,
    follow: true
  }
};

export default function TermsPage() {
  return <TermsClient />;
}
