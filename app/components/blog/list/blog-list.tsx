import React from "react";
import BlogCard from "./blog-card";
import type { SanityPost } from "@/app/blog/types";

interface BlogListProps {
  posts: SanityPost[];
}

const BlogList: React.FC<BlogListProps> = ({ posts }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
      {posts.map((post) => (
        <BlogCard key={post._id} post={post} />
      ))}
    </div>
  );
};

export default BlogList;
