import React, { Suspense } from "react";
import { getPosts, getCategories, getCachedPosts } from "@/app/lib/sanity-data";
import HomeClient from "@/app/components/blog/home-client";
import { Metadata } from "next";

// Force dynamic rendering to ensure fresh data
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const posts = await getCachedPosts();
  const latest = posts[0];
  return {
    title: "Noblocks Blog - Decentralized Payments News & Insights",
    description: "Discover the latest in decentralized payments, stablecoin news, crypto remittance guides, and Web3 finance insights. Learn about USDC, USDT, DAI transfers, cross-border payments, and blockchain technology innovations.",
    keywords: "Noblocks blog, decentralized payments, stablecoin news, crypto remittance, web3 finance, blockchain payments, USDC news, USDT updates, DAI insights, cross-border payments, fintech blog",
    alternates: {
      canonical: "https://noblocks.xyz/blog",
    },
    openGraph: {
      title: "Noblocks Blog - Decentralized Payments News & Insights",
      description: "Discover the latest in decentralized payments, stablecoin news, crypto remittance guides, and Web3 finance insights.",
      images:
        latest && latest.mainImage
          ? [
              {
                url: latest.mainImage,
                width: 800,
                height: 400,
                alt: latest.title,
              },
            ]
          : [],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Noblocks Blog - Decentralized Payments News & Insights",
      description: "Discover the latest in decentralized payments, stablecoin news, crypto remittance guides, and Web3 finance insights.",
      creator: "@noblocks_xyz",
      site: "@noblocks_xyz",
      images: latest && latest.mainImage ? [latest.mainImage] : ["https://noblocks.xyz/images/og-image.jpg"],
    },
  };
}

export default async function Home() {
  // Fetch data from Sanity (cached to avoid duplicate fetch in metadata)
  const sanityPosts = await getCachedPosts();
  const sanityCategories = await getCategories();

  // Pass data directly to HomeClient
  return (
    <Suspense
      fallback={
        <div className="text-sm text-text-secondary dark:text-white/50">
          Loading blogs...
        </div>
      }
    >
      <HomeClient blogPosts={sanityPosts} categories={sanityCategories} />
    </Suspense>
  );
}
