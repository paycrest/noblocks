import { client } from "./sanity-client";
import { unstable_cache } from "next/cache";
import {
  postsQuery,
  postQuery,
  recentPostsQuery,
  categoriesQuery,
} from "./sanity-queries";
import type { SanityPost, SanityCategory } from "@/app/blog/types";

// Ensure Sanity is configured
function ensureSanityConfigured() {
  if (!client) {
    throw new Error(
      "Sanity client is not configured. Check your environment variables.",
    );
  }
}

// Fetch all posts
export async function getPosts(): Promise<SanityPost[]> {
  ensureSanityConfigured();
  return await client!.fetch(
    postsQuery,
    {},
    {
      next: { revalidate: 300 },
    },
  );
}

// Cached variant to avoid duplicate fetches within a single render
export const getCachedPosts = unstable_cache(
  async (): Promise<SanityPost[]> => getPosts(),
  ["sanity-posts"],
  { revalidate: 300 },
);

// Fetch a single post by slug
export async function getPost(slug: string): Promise<SanityPost | null> {
  ensureSanityConfigured();
  return await client!.fetch(
    postQuery,
    { slug },
    {
      next: { revalidate: 300 },
    },
  );
}

// Fetch recent posts (excluding current and optionally featured)
export async function getRecentPosts(
  currentSlug: string,
  featuredSlug?: string,
): Promise<SanityPost[]> {
  ensureSanityConfigured();
  return await client!.fetch(
    recentPostsQuery,
    {
      currentSlug,
      featuredSlug: featuredSlug || null,
    },
    {
      next: { revalidate: 300 },
    },
  );
}

// Fetch all categories
export async function getCategories(): Promise<SanityCategory[]> {
  ensureSanityConfigured();
  return await client!.fetch(
    categoriesQuery,
    {},
    {
      next: { revalidate: 300 },
    },
  );
}
