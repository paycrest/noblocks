import { Metadata } from "next";
import PrivacyClient from "./privacy-client";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Privacy Policy for Noblocks - Learn how we protect your data and privacy.",
  openGraph: {
    title: "Privacy Policy | Noblocks",
    description:
      "Privacy Policy for Noblocks - Learn how we protect your data and privacy.",
    url: "https://noblocks.xyz/privacy-policy",
    type: "website",
  },
  twitter: {
    title: "Privacy Policy | Noblocks",
    description:
      "Privacy Policy for Noblocks - Learn how we protect your data and privacy.",
  },
};

export default function PrivacyPolicyPage() {
  return <PrivacyClient />;
}
