"use client";

import React from "react";
import { motion } from "framer-motion";
import { fadeBlur } from "@/app/components/blog/shared/animations";

const BlogPostAuthorSkeleton: React.FC = () => (
  <motion.section
    className="mx-auto mb-8 mt-8 flex w-full max-w-2xl animate-pulse items-center gap-4 rounded-xl bg-[#181A20] p-4 shadow"
    variants={fadeBlur}
    initial="initial"
    animate="animate"
    role="status"
    aria-live="polite"
  >
    <span className="sr-only">Loading author information...</span>
    <div className="h-14 w-14 rounded-full bg-gray-700" aria-hidden="true" />
    <div>
      <div className="mb-2 h-4 w-32 rounded bg-gray-700" aria-hidden="true" />
      <div className="h-3 w-24 rounded bg-gray-700" aria-hidden="true" />
    </div>
  </motion.section>
);

export default BlogPostAuthorSkeleton;
