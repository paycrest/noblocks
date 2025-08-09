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
  return (
    <div className="w-full">
      <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
        Recent blogs
      </h3>
      <div className="flex gap-4 overflow-x-auto pb-2">
        <AnimatePresence initial={false}>
          {posts.map((post) => (
            <motion.div
              key={post._id}
              {...fadeSlideUp}
              className="min-w-[320px] max-w-xs flex-shrink-0"
            >
              <BlogCard post={post} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default RecentBlogs;
