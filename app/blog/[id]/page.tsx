import DetailClient from "@/app/components/blog/post/detail-client";
import { getPost, getRecentPosts } from "@/app/lib/sanity-data";
import { notFound } from "next/navigation";
import { Metadata } from "next";

// Force dynamic rendering to ensure fresh data
export const dynamic = "force-dynamic";

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
    description: post.excerpt || undefined,
    openGraph: {
      title: post.title,
      description: post.excerpt || undefined,
      images: post.mainImage
        ? [
            {
              url: typeof post.mainImage === "string" ? post.mainImage : "",
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
      description: post.excerpt || undefined,
      images: post.mainImage
        ? [typeof post.mainImage === "string" ? post.mainImage : ""]
        : [],
    },
  };
}

export default async function BlogPostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const post = await getPost(id);
  if (!post) notFound();

  const recent = await getRecentPosts(post.slug.current);
  return <DetailClient post={post} recent={recent} />;
}

// Implement static params for SSG
import { client } from "@/app/lib/sanity-client";
import { groq } from "next-sanity";
export async function generateStaticParams() {
  const slugs = await client!.fetch(
    groq`*[_type == "post" && defined(slug.current)]{ "id": slug.current }`,
  );
  return slugs;
}
