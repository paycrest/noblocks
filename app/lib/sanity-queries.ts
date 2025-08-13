import { groq } from "next-sanity";

// Query for all posts with basic info
export const postsQuery = groq`
  *[_type == "post" && publishedAt <= now()] | order(publishedAt desc) {
    _id,
    title,
    slug,
    publishedAt,
    "mainImage": mainImage.asset->url,
    "author": {
      "name": author->name,
      "slug": author->slug,
      "image": author->image.asset->url,
      "bio": author->bio
    },
    "category": coalesce(
      category->{
        _id,
        title,
        description
      },
      categories[0]->{
        _id,
        title,
        description
      }
    ),
    "excerpt": select(
      string::length(pt::text(body)) > 0 => pt::text(body[0...200]) + "...",
      null
    )
  }
`;

// Query for a single post with full content
export const postQuery = groq`
  *[_type == "post" && slug.current == $slug && publishedAt <= now()][0] {
    _id,
    title,
    slug,
    publishedAt,
    "mainImage": mainImage.asset->url,
    "author": {
      "name": author->name,
      "slug": author->slug,
      "image": author->image.asset->url,
      "bio": author->bio
    },
    "category": coalesce(
      category->{
        _id,
        title,
        description
      },
      categories[0]->{
        _id,
        title,
        description
      }
    ),
    body
  }
`;

// Query for recent posts (excluding current post and optionally featured post)
export const recentPostsQuery = groq`
  *[_type == "post" && publishedAt <= now() && slug.current != $currentSlug && ($featuredSlug == null || slug.current != $featuredSlug)] | order(publishedAt desc)[0...3] {
    _id,
    title,
    slug,
    publishedAt,
    "mainImage": mainImage.asset->url,
    "author": {
      "name": author->name,
      "image": author->image.asset->url
    },
    "category": coalesce(
      category->{
        _id,
        title
      },
      categories[0]->{
        _id,
        title
      }
    )
  }
`;

// Query for all categories
export const categoriesQuery = groq`
  *[_type == "category"] {
    _id,
    title,
    description
  }
`;

// Query for all authors
export const authorsQuery = groq`
  *[_type == "author"] {
    _id,
    name,
    slug,
    "image": image.asset->url,
    bio
  }
`;
