import "./globals.css";
import React from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import config from "./lib/config";

import Providers from "./providers";
import MainContent from "./mainContent";
import {
  Footer,
  Navbar,
  LayoutWrapper,
  PWAInstall,
  NoticeBanner,
} from "./components";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Noblocks - Decentralized Payments Interface",
    template: "%s | Noblocks",
  },
  description:
    "The first interface for decentralized payments to any bank or mobile wallet, powered by a distributed network of liquidity nodes.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Noblocks",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "msapplication-TileColor": "#317EFB",
    "msapplication-tap-highlight": "no",
  },
  applicationName: "Noblocks",
  category: "Finance",
  classification: "Financial Technology",
  referrer: "origin-when-cross-origin",
  keywords: [
    // Stablecoin Primary Keywords
    "stablecoin payments",
    "USDC payments",
    "USDT payments",
    "DAI payments",
    "stablecoin remittance",
    "crypto remittance",
    "stablecoin transfer",

    // Stablecoin to Fiat Keywords
    "USDC to bank transfer",
    "USDT to bank transfer",
    "DAI to bank transfer",
    "stablecoin to fiat",
    "crypto to bank transfer",
    "stablecoin to mobile money",
    "USDC to mobile money",
    "USDT to mobile money",

    // Stablecoin Benefits Keywords
    "instant stablecoin transfer",
    "low fee stablecoin transfer",
    "cheap crypto remittance",
    "fast stablecoin payment",
    "secure stablecoin transfer",
    "reliable crypto payment",

    // Stablecoin Use Cases
    "send stablecoins to Africa",
    "USDC to Nigeria",
    "USDT to Kenya",
    "DAI to Ghana",
    "stablecoin to Tanzania",
    "USDC to Uganda",
    "USDT to South Africa",

    // Stablecoin Technology Keywords
    "blockchain remittance",
    "crypto payment solution",
    "digital currency transfer",
    "tokenized remittance",
    "smart contract payments",
    "on-chain payments",

    // Stablecoin Comparison Keywords
    "better than traditional remittance",
    "cheaper than bank transfer",
    "faster than wire transfer",
    "more reliable than traditional payment",
    "better than fiat transfer",

    // Stablecoin Security Keywords
    "secure stablecoin transfer",
    "safe crypto payment",
    "regulated stablecoin transfer",
    "compliant crypto remittance",
    "trusted stablecoin service",

    // Stablecoin Education Keywords
    "how to use stablecoins",
    "stablecoin remittance guide",
    "crypto payment tutorial",
    "stablecoin transfer guide",
    "learn crypto remittance",

    // Stablecoin Business Keywords
    "business stablecoin payment",
    "corporate crypto remittance",
    "B2B stablecoin transfer",
    "enterprise crypto payment",
    "business USDC transfer",

    // Stablecoin Network Keywords
    "Polygon stablecoin transfer",
    "Base stablecoin payment",
    "Arbitrum stablecoin transfer",
    "BNB Chain stablecoin payment",
    "Ethereum stablecoin transfer",

    // Stablecoin Features Keywords
    "24/7 stablecoin transfer",
    "borderless crypto payment",
    "global stablecoin transfer",
    "instant settlement",
    "real-time crypto payment",

    // Stablecoin Problem-Solution Keywords
    "high remittance fee solution",
    "slow transfer solution",
    "expensive payment alternative",
    "complex remittance simplified",
    "difficult transfer solution",

    // Stablecoin Trend Keywords
    "next-gen remittance",
    "future of payments",
    "modern money transfer",
    "innovative remittance",
    "cutting-edge payment solution",
  ].join(", "),
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: config.googleVerificationCode,
  },
  alternates: {
    canonical: "https://noblocks.xyz",
  },
  publisher: "Noblocks",
  authors: [{ name: "Noblocks", url: "https://noblocks.xyz" }],
  metadataBase: new URL("https://noblocks.xyz"),
  openGraph: {
    title: "Noblocks - Decentralized Payments Interface",
    description:
      "The first interface for decentralized payments to any bank or mobile wallet, powered by a distributed network of liquidity nodes.",
    url: "https://noblocks.xyz",
    siteName: "Noblocks",
    images: [
      {
        url: "https://noblocks.xyz/images/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Noblocks - Decentralized Payments Interface",
      },
    ],
    locale: "en_US",
    type: "website",
    countryName: "United States",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/apple-touch-icon.png",
  },
  twitter: {
    card: "summary_large_image",
    title: "Noblocks - Decentralized Payments Interface",
    description:
      "The first interface for decentralized payments to any bank or mobile wallet, powered by a distributed network of liquidity nodes.",
    creator: "@noblocks_xyz",
    site: "@noblocks_xyz",
    images: ["https://noblocks.xyz/images/og-image.jpg"],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Noblocks",
  description:
    "The first interface for decentralized payments to any bank or mobile wallet, powered by a distributed network of liquidity nodes.",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  url: "https://noblocks.xyz",
  sameAs: [
    "https://x.com/noblocks_xyz",
    "https://github.com/paycrest/noblocks",
    "https://noblocks.xyz",
  ],
  publisher: {
    "@type": "Organization",
    name: "Noblocks",
    url: "https://noblocks.xyz",
    logo: {
      "@type": "ImageObject",
      url: "https://noblocks.xyz/icons/noblocks-logo.svg",
    },
  },
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
    validFrom: "2024-01-01",
  },
  featureList: [
    "USDC payments",
    "USDT payments",
    "DAI payments",
    "Instant stablecoin transfers",
    "Low-fee crypto remittance",
    "Cross-border stablecoin payments",
    "Crypto to bank transfers",
    "Crypto to mobile money",
    "24/7 availability",
    "Global reach",
    "Secure transactions",
    "Real-time processing",
  ],
  supportedNetworks: [
    "Polygon",
    "Base",
    "Arbitrum",
    "BNB Chain",
    "Ethereum",
    "Celo",
    "Lisk",
    "Optimism",
  ],
  supportedStablecoins: ["USDC", "USDT", "DAI", "cNGN"],
  audience: {
    "@type": "Audience",
    audienceType: "Cryptocurrency users, Remittance senders, DeFi users",
  },
  potentialAction: {
    "@type": "UseAction",
    target: "https://noblocks.xyz",
    name: "Send stablecoin payments",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.className} overflow-x-hidden`}
        suppressHydrationWarning
      >
        <Script
          id="noblocks-ld-json"
          type="application/ld+json"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <Providers>
          <div className="min-h-full min-w-full bg-white transition-colors dark:bg-neutral-900">
            <div className="relative">
              <Navbar />
              {config.noticeBannerText && (
                <NoticeBanner textLines={config.noticeBannerText.split("|")} />
              )}
            </div>
            <LayoutWrapper footer={<Footer />}>
              <MainContent>{children}</MainContent>
            </LayoutWrapper>

            <PWAInstall />
          </div>
        </Providers>

        {/* Brevo Chat Widget */}
        {/^[a-f0-9]{24}$/i.test(config.brevoConversationsId) && (
          <>
            {" "}
            <Script id="brevo-chat-config" strategy="afterInteractive">
              {" "}
              {`window.BrevoConversationsID=${JSON.stringify(config.brevoConversationsId)};window.BrevoConversations=window.BrevoConversations||function(){(window.BrevoConversations.q=window.BrevoConversations.q||[]).push(arguments)};`}{" "}
            </Script>{" "}
            <Script
              id="brevo-chat-widget"
              src="https://conversations-widget.brevo.com/brevo-conversations.js"
              strategy="afterInteractive"
            />{" "}
          </>
        )}
      </body>
    </html>
  );
}
