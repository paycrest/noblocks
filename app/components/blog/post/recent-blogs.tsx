import React from "react";
import type { SanityPost } from "@/app/blog/types";
import BlogCard from "@/app/components/blog/list/blog-card";

interface BlogPostRecentBlogsProps {
  posts: SanityPost[];
}

const BlogPostRecentBlogs: React.FC<BlogPostRecentBlogsProps> = ({ posts }) => {
  if (!posts?.length) return null;
  return (
    <section className="mt-12 w-full">
      <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
        Recent blogs
      </h3>
      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2">
        {posts.map((post) => (
          <div
            key={post._id}
            className="min-w-[320px] max-w-xs flex-shrink-0 snap-start"
          >
            <BlogCard post={post} />
          </div>
        ))}
      </div>
    </section>
  );
};

export default BlogPostRecentBlogs;
