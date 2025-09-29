import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: {
    default: "Noblocks Blog - Decentralized Payments News",
    template: "%s | Noblocks Blog",
  },
  description: "Noblocks Blog - Your source for decentralized payments insights, stablecoin news, crypto remittance guides, and Web3 financial technology updates. Learn about USDC, USDT, DAI transfers, cross-border payments, and the future of digital finance.",
  keywords: [
    // Primary Blog Keywords
    "Noblocks blog",
    "decentralized payments blog",
    "stablecoin news",
    "crypto remittance blog",
    "web3 finance blog",
    "blockchain payments blog",
    
    // Stablecoin Blog Keywords
    "USDC news and updates",
    "USDT market insights",
    "DAI stablecoin analysis",
    "stablecoin adoption trends",
    "crypto to bank transfer guide",
    "stablecoin to fiat conversion",
    
    // Geographic Keywords
    "crypto Africa news",
    "web3 Africa blog",
    "Nigeria crypto news",
    "African fintech blog",
    "emerging markets crypto",
    
    // Educational Keywords
    "crypto education blog",
    "blockchain tutorials",
    "defi learning resources",
    "stablecoin how-to guides",
    "crypto remittance education",
    "digital payments guide",
    
    // Industry Keywords
    "fintech blog",
    "payments industry news",
    "remittance technology",
    "cross-border payments blog",
    "digital finance insights",
    "crypto market analysis",
    
    // Technical Keywords
    "liquidity nodes",
    "decentralized finance",
    "blockchain technology",
    "smart contracts",
    "web3 infrastructure",
    "crypto protocols",
    
    // Trend Keywords
    "future of payments",
    "next-gen remittance",
    "digital currency trends",
    "crypto adoption news",
    "blockchain innovation",
    "fintech disruption",
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
  description: "Your source for decentralized payments insights, stablecoin news, crypto remittance guides, and Web3 financial technology updates.",
  publisher: {
    "@type": "Organization",
    name: "Paycrest",
    url: "https://paycrest.io",
    logo: {
      "@type": "ImageObject",
      url: "https://noblocks.xyz/logos/noblocks-logo.svg",
    },
  },
  url: "https://noblocks.xyz/blog",
  inLanguage: "en-US",
  about: [
    {
      "@type": "Thing",
      name: "Decentralized Payments",
    },
    {
      "@type": "Thing", 
      name: "Stablecoin Technology",
    },
    {
      "@type": "Thing",
      name: "Crypto Remittance",
    },
    {
      "@type": "Thing",
      name: "Web3 Finance",
    },
  ],
  keywords: "decentralized payments, stablecoin news, crypto remittance, web3 finance, blockchain payments, USDC, USDT, DAI, cross-border payments, fintech blog",
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
