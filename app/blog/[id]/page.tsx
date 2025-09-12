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

  return {
    title: post.title,
    description:
      post.excerpt ||
      (post.body
        ? extractPlainTextFromPortableText(post.body).slice(0, 120) + "..."
        : ""),
    openGraph: {
      title: post.title,
      description:
        post.excerpt ||
        (post.body
          ? extractPlainTextFromPortableText(post.body).slice(0, 120) + "..."
          : ""),
      images: post.mainImage
        ? [
            {
              url: post.mainImage,
              width: 800,
              height: 400,
              alt: post.title,
            },
          ]
        : [],
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description:
        post.excerpt ||
        (post.body
          ? extractPlainTextFromPortableText(post.body).slice(0, 120) + "..."
          : ""),
      images: post.mainImage ? [post.mainImage] : [],
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
