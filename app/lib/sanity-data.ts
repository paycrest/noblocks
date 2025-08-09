import { client } from "./sanity-client";
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
      "Sanity client is not configured. Check your environment variables."
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
      next: { revalidate: 0 }, // Disable caching
    }
  );
}

// Fetch a single post by slug
export async function getPost(slug: string): Promise<SanityPost | null> {
  ensureSanityConfigured();
  return await client!.fetch(
    postQuery,
    { slug },
    {
      next: { revalidate: 0 }, // Disable caching
    }
  );
}

// Fetch recent posts (excluding current and optionally featured)
export async function getRecentPosts(
  currentSlug: string,
  featuredSlug?: string
): Promise<SanityPost[]> {
  ensureSanityConfigured();
  return await client!.fetch(
    recentPostsQuery,
    {
      currentSlug,
      featuredSlug: featuredSlug || null,
    },
    {
      next: { revalidate: 0 }, // Disable caching
    }
  );
}

// Fetch all categories
export async function getCategories(): Promise<SanityCategory[]> {
  ensureSanityConfigured();
  return await client!.fetch(
    categoriesQuery,
    {},
    {
      next: { revalidate: 0 }, // Disable caching
    }
  );
}
