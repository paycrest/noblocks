"use client";

import React from "react";
import BlogCardSkeleton from "./blog-card-skeleton";
import { motion } from "framer-motion";
import { fadeBlur } from "@/app/components/blog/shared/animations";

const BlogListSkeleton: React.FC = () => (
  <motion.div
    className="flex w-full flex-col items-center"
    variants={fadeBlur}
    initial="initial"
    animate="animate"
    exit="exit"
    aria-busy="true"
    aria-live="polite"
  >
    <span className="sr-only">Loading blog posts...</span>
    <div className="w-full space-y-4">
      {[...Array(6)].map((_, i) => (
        <BlogCardSkeleton key={i} />
      ))}
    </div>
  </motion.div>
);

export default BlogListSkeleton;
