import { Metadata } from "next";
import PrivacyClient from "./privacy-client";

export const metadata: Metadata = {
  title: "Privacy Policy | Noblocks",
  description:
    "Privacy Policy for Noblocks - Learn how we protect your data and privacy when using our decentralized payments service. Your data security is our priority.",
  keywords: [
    "privacy policy",
    "data protection",
    "noblocks privacy",
    "crypto privacy",
    "stablecoin privacy",
    "decentralized payment privacy",
    "user data protection",
    "privacy compliance"
  ],
  openGraph: {
    title: "Privacy Policy | Noblocks",
    description:
      "Privacy Policy for Noblocks - Learn how we protect your data and privacy when using our decentralized payments service.",
    url: "https://noblocks.xyz/privacy-policy",
    type: "website",
    images: [
      {
        url: "https://noblocks.xyz/images/og-privacy.jpg",
        width: 1200,
        height: 630,
        alt: "Noblocks Privacy Policy"
      }
    ]
  },
  twitter: {
    card: "summary",
    title: "Privacy Policy | Noblocks",
    description:
      "Privacy Policy for Noblocks - Learn how we protect your data and privacy when using our decentralized payments service.",
  },
  alternates: {
    canonical: "https://noblocks.xyz/privacy-policy"
  },
  robots: {
    index: true,
    follow: true
  }
};

export default function PrivacyPolicyPage() {
  return <PrivacyClient />;
}
