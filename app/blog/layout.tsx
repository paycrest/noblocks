import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: {
    default: "Noblocks Blog - Decentralized Payments News",
    template: "%s | Noblocks Blog",
  },
  description: "Noblocks Blog - Decentralized payments, news, and updates.",
  keywords: [
    "decentralized payments",
    "stablecoin news",
    "crypto remittance",
    "web3 blog",
    "blockchain updates",
    "Noblocks blog",
    "USDC news",
    "USDT news",
    "DAI news",
    "crypto to bank",
    "stablecoin to fiat",
    "web3 Africa",
    "crypto education",
    "remittance trends",
    "cross-border payments",
    "liquidity nodes",
    "crypto adoption",
    "decentralized finance",
    "fintech blog",
    "crypto insights",
    "stablecoin adoption",
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
  // Note: Use per-post canonical in page files to avoid duplicate-content signals
  publisher: "Paycrest",
  authors: [{ name: "Paycrest", url: "https://paycrest.io" }],
  metadataBase: new URL("https://noblocks.xyz"),
  openGraph: {
    title: "Noblocks Blog",
    description: "Noblocks Blog - Decentralized payments, news, and updates.",
    url: "https://noblocks.xyz/blog",
    siteName: "Noblocks Blog",
    images: [
      {
        url: "https://noblocks.xyz/images/og-image.jpg",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Noblocks Blog",
    description: "Noblocks Blog - Decentralized payments, news, and updates.",
    creator: "@noblocks_xyz",
    images: ["https://noblocks.xyz/images/og-image.jpg"],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Blog",
  name: "Noblocks Blog",
  description: "Noblocks Blog - Decentralized payments, news, and updates.",
  publisher: {
    "@type": "Organization",
    name: "Paycrest",
    url: "https://paycrest.io",
  },
  url: "https://noblocks.xyz/blog",
  inLanguage: "en-US",
  blogPost: [], // Will be populated dynamically per post page
};

export default function BlogLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Script
        id="noblocks-blog-ld-json"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(Object.freeze(jsonLd)),
        }}
      />
      {children}
    </>
  );
}
