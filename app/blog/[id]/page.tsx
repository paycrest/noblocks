import DetailClient from "@/app/components/blog/post/detail-client";
import { getPost, getRecentPosts } from "@/app/lib/sanity-data";
import { notFound, redirect } from "next/navigation";
import { Metadata } from "next";
import type { PortableTextBlock } from "@portabletext/types";

// Force dynamic rendering to ensure fresh data
export const dynamic = "force-dynamic";

// Helper function to extract plain text from PortableText blocks
const extractPlainTextFromPortableText = (
  blocks: PortableTextBlock[],
): string => {
  if (!blocks || !Array.isArray(blocks)) return "";

  return blocks
    .map((block) => {
      if (block._type === "block" && block.children) {
        return block.children
          .map((child) => ("text" in child ? child.text : ""))
          .join("");
      }
      return "";
    })
    .join(" ")
    .trim();
};
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const post = await getPost(id);
  if (!post) return {};

  const description = post.excerpt ||
    (post.body
      ? extractPlainTextFromPortableText(post.body).slice(0, 155) + "..."
      : "Read the latest insights on decentralized payments, stablecoin news, and crypto remittance on Noblocks Blog.");

  return {
    title: post.title,
    description,
    keywords: [
      post.title,
      "Noblocks blog",
      "decentralized payments",
      "stablecoin news",
      "crypto remittance",
      "web3 finance",
      "blockchain payments",
      ...(post.category ? [post.category.title] : []),
    ].join(", "),
    alternates: {
      canonical: `https://noblocks.xyz/blog/${post.slug.current}`,
    },
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
    publisher: "Paycrest",
    authors: post.author ? [{ name: post.author.name }] : [{ name: "Noblocks Team" }],
    openGraph: {
      title: post.title,
      description,
      url: `https://noblocks.xyz/blog/${post.slug.current}`,
      siteName: "Noblocks Blog",
      images: post.mainImage
        ? [
            {
              url: post.mainImage,
              width: 1200,
              height: 630,
              alt: post.title,
            },
          ]
        : [
            {
              url: "https://noblocks.xyz/images/og-image.jpg",
              width: 1200,
              height: 630,
              alt: "Noblocks Blog",
            },
          ],
      type: "article",
      publishedTime: post.publishedAt,
      authors: post.author ? [post.author.name] : ["Noblocks Team"],
      section: post.category?.title || "Decentralized Payments",
      tags: post.category ? [post.category.title] : [],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description,
      creator: "@noblocks_xyz",
      site: "@noblocks_xyz",
      images: post.mainImage ? [post.mainImage] : ["https://noblocks.xyz/images/og-image.jpg"],
    },
  };
}

export default async function BlogPostDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mini?: string }>;
}) {
  // Redirect to home page if in mini mode
  const resolvedSearchParams = await searchParams;
  if (resolvedSearchParams.mini === "true") {
    redirect("/?mini=true");
  }

  const { id } = await params;
  const post = await getPost(id);
  if (!post) notFound();

  const recent = await getRecentPosts(post.slug.current);
  return <DetailClient post={post} recent={recent} />;
}

// Implement static params for SSG
import { client } from "@/app/lib/sanity-client";
import { groq } from "next-sanity";
// Using dynamic rendering; SSG params removed to avoid conflicting strategies
