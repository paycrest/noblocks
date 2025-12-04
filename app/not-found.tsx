import { Metadata } from "next";
import NotFoundClient from "./not-found-client";

export const metadata: Metadata = {
  title: "404 - Page Not Found | Noblocks",
  description:
    "The page you're looking for doesn't exist. Return to Noblocks to continue using our decentralized payments service.",
  robots: {
    index: false,
    follow: true,
  },
  openGraph: {
    title: "404 - Page Not Found | Noblocks",
    description:
      "The page you're looking for doesn't exist. Return to Noblocks to continue using our decentralized payments service.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "404 - Page Not Found | Noblocks",
    description:
      "The page you're looking for doesn't exist. Return to Noblocks to continue using our decentralized payments service.",
  },
};

export default function NotFound() {
  return <NotFoundClient />;
}
