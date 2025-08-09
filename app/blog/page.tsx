import React, { Suspense } from "react";
import { getPosts, getCategories } from "@/app/lib/sanity-data";
import HomeClient from "@/app/components/blog/home-client";
import { Metadata } from "next";

// Force dynamic rendering to ensure fresh data
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const posts = await getPosts();
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
                url:
                  typeof latest.mainImage === "string" ? latest.mainImage : "",
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
      images:
        latest && latest.mainImage
          ? [typeof latest.mainImage === "string" ? latest.mainImage : ""]
          : [],
    },
  };
}

export default async function Home() {
  // Fetch data from Sanity
  const sanityPosts = await getPosts();
  const sanityCategories = await getCategories();

  // Pass data directly to HomeClient
  return (
    <Suspense>
      <HomeClient blogPosts={sanityPosts} categories={sanityCategories} />
    </Suspense>
  );
}
