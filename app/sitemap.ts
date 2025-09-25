import { MetadataRoute } from "next";
import { getCachedPosts } from "./lib/sanity-data";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Get all blog posts for sitemap
  const posts = await getCachedPosts();
  
  // Create blog post URLs
  const blogPosts = posts  
    .filter((p) => p?.slug?.current)  
    .map((post) => ({  
      url: `https://noblocks.xyz/blog/${post.slug.current}`,  
      lastModified: post.publishedAt ? new Date(post.publishedAt) : new Date(),  
      changeFrequency: "weekly" as const,  
      priority: 0.8,  
    }));  

  return [
    {
      url: "https://noblocks.xyz",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://noblocks.xyz/blog",  
      lastModified: new Date(),  
      changeFrequency: "daily",  
      priority: 0.6,  
    },  
    ...blogPosts,
    {
      url: "https://noblocks.xyz/terms",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: "https://noblocks.xyz/privacy-policy",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];
}
