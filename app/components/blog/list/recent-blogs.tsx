"use client";

import React from "react";
import type { SanityPost } from "@/app/blog/types";
import { BlogCard } from ".";
import { motion, AnimatePresence } from "framer-motion";
import { fadeSlideUp } from "@/app/components/blog/shared/animations";

interface RecentBlogsProps {
  posts: SanityPost[];
}

const RecentBlogs: React.FC<RecentBlogsProps> = ({ posts }) => {
  if (!posts?.length) return null;
  return (
    <div className="w-full">
      <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
        Recent blogs
      </h3>
      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2">
        {posts.map((post) => (
          <motion.div
            key={post._id}
            {...fadeSlideUp}
            className="min-w-[320px] max-w-xs shrink-0 snap-start"
          >
            <BlogCard post={post} />
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default RecentBlogs;
