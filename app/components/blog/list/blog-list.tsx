"use client";

import React from "react";
import BlogCard from "./blog-card";
import type { SanityPost } from "@/app/blog/types";

interface BlogListProps {
  posts: SanityPost[];
}

const BlogList: React.FC<BlogListProps> = ({ posts }) => {
  return (
    <ul className="grid list-none grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((post) => (
        <li key={post._id}>
          <BlogCard post={post} />
        </li>
      ))}
    </ul>
  );
};

export default BlogList;
