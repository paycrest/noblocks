import { Metadata } from "next";
import TermsClient from "./terms-client";

export const metadata: Metadata = {
  title: "Terms of Use",
  description:
    "Terms of Use for Noblocks - Read our terms and conditions for using our decentralized payments service.",
  openGraph: {
    title: "Terms of Use | Noblocks",
    description:
      "Terms of Use for Noblocks - Read our terms and conditions for using our decentralized payments service.",
    url: "https://noblocks.xyz/terms",
    type: "website",
  },
  twitter: {
    title: "Terms of Use | Noblocks",
    description:
      "Terms of Use for Noblocks - Read our terms and conditions for using our decentralized payments service.",
  },
};

export default function TermsPage() {
  return <TermsClient />;
}
