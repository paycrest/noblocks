import { client } from "./sanity-client";
import { unstable_cache } from "next/cache";
import {
  postsQuery,
  postQuery,
  recentPostsQuery,
  categoriesQuery,
} from "./sanity-queries";
import type { SanityPost, SanityCategory } from "@/app/blog/types";

// Fetch all posts (returns empty array if Sanity is not configured)
export async function getPosts(): Promise<SanityPost[]> {
  if (!client) {
    // Return empty array instead of throwing to allow builds without Sanity
    return [];
  }
  try {
    return await client.fetch(
      postsQuery,
      {},
      {
        next: { revalidate: 300 },
      },
    );
  } catch (error) {
    // If Sanity fetch fails (e.g., invalid project ID), return empty array
    console.warn("Failed to fetch Sanity posts:", error);
    return [];
  }
}

// Cached variant to avoid duplicate fetches within a single render
export const getCachedPosts = unstable_cache(
  async (): Promise<SanityPost[]> => getPosts(),
  ["sanity-posts"],
  { revalidate: 300 },
);

// Fetch a single post by slug
export async function getPost(slug: string): Promise<SanityPost | null> {
  if (!client) return null;
  try {
    return await client.fetch(
      postQuery,
      { slug },
      {
        next: { revalidate: 300 },
      },
    );
  } catch (error) {
    console.warn("Failed to fetch Sanity post:", error);
    return null;
  }
}

// Fetch recent posts (excluding current and optionally featured)
export async function getRecentPosts(
  currentSlug: string,
  featuredSlug?: string,
): Promise<SanityPost[]> {
  if (!client) return [];
  try {
    return await client.fetch(
      recentPostsQuery,
      {
        currentSlug,
        featuredSlug: featuredSlug || null,
      },
      {
        next: { revalidate: 300 },
      },
    );
  } catch (error) {
    console.warn("Failed to fetch recent Sanity posts:", error);
    return [];
  }
}

// Fetch all categories
export async function getCategories(): Promise<SanityCategory[]> {
  if (!client) return [];
  try {
    return await client.fetch(
      categoriesQuery,
      {},
      {
        next: { revalidate: 300 },
      },
    );
  } catch (error) {
    console.warn("Failed to fetch Sanity categories:", error);
    return [];
  }
}
