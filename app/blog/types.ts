import type { PortableTextBlock } from "@portabletext/types";
// Sanity-based types
export type SanityAuthor = {
  _id: string;
  name: string;
  slug: { current: string };
  image: string;
  bio: unknown[];
};

export type SanityCategory = {
  _id: string;
  title: string;
  description?: string;
};

export type SanityPost = {
  _id: string;
  title: string;
  slug: { current: string };
  publishedAt: string;
  mainImage: string;
  author: SanityAuthor;
  category?: SanityCategory;
  body: PortableTextBlock[];
  excerpt?: string;
};
