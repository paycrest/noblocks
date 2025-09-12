import React, { Suspense } from "react";
import { getPosts, getCategories, getCachedPosts } from "@/app/lib/sanity-data";
import HomeClient from "@/app/components/blog/home-client";
import { Metadata } from "next";
import { redirect } from "next/navigation";

// Force dynamic rendering to ensure fresh data
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const posts = await getCachedPosts();
  const latest = posts[0];
  return {
    title: "Noblocks Blog - Decentralized Payments News",
    description: "Noblocks Blog - Decentralized payments, news, and updates.",
    openGraph: {
      title: "Noblocks Blog - Decentralized Payments News",
      description: "Noblocks Blog - Decentralized payments, news, and updates.",
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
      title: "Noblocks Blog - Decentralized Payments News",
      description: "Noblocks Blog - Decentralized payments, news, and updates.",
      images: latest && latest.mainImage ? [latest.mainImage] : [],
    },
  };
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ mini?: string }>;
}) {
  // Redirect to home page if in mini mode
  const resolvedSearchParams = await searchParams;
  if (resolvedSearchParams.mini === "true") {
    redirect("/?mini=true");
  }

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
