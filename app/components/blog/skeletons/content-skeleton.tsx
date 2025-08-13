"use client";

import React from "react";
import { motion } from "framer-motion";
import { fadeBlur } from "@/app/components/blog/shared/animations";

const BlogPostContentSkeleton: React.FC = () => (
  <motion.article
    className="mx-auto mb-8 w-full max-w-3xl animate-pulse rounded-xl bg-[#181A20] p-6 shadow-lg md:p-10"
    variants={fadeBlur}
    initial="initial"
    animate="animate"
  >
    <div className="mb-4 h-8 w-3/4 rounded bg-gray-700" />
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="h-3 w-20 rounded bg-gray-700" />
      <div className="h-3 w-16 rounded bg-gray-700" />
      <div className="h-3 w-24 rounded bg-gray-700" />
    </div>
    <div className="mb-6 h-64 w-full rounded-lg bg-gray-700 md:h-96" />
    <div className="space-y-4">
      <div className="h-4 w-full rounded bg-gray-700" />
      <div className="h-4 w-5/6 rounded bg-gray-700" />
      <div className="h-4 w-2/3 rounded bg-gray-700" />
      <div className="h-4 w-1/2 rounded bg-gray-700" />
    </div>
    <div className="mt-4 flex gap-2">
      <div className="h-6 w-16 rounded-full bg-gray-700" />
      <div className="h-6 w-16 rounded-full bg-gray-700" />
    </div>
  </motion.article>
);

export default BlogPostContentSkeleton;
