"use client";

import React from "react";
import { motion } from "framer-motion";
import { fadeBlur } from "@/app/components/blog/shared/animations";

const BlogPostContentSkeleton: React.FC = () => (
  <motion.article
    className="w-full max-w-3xl mx-auto bg-[#181A20] rounded-xl shadow-lg p-6 md:p-10 mb-8 animate-pulse"
    variants={fadeBlur}
    initial="initial"
    animate="animate"
    exit="exit"
  >
    <div className="h-8 w-3/4 bg-gray-700 rounded mb-4" />
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <div className="h-3 w-20 bg-gray-700 rounded" />
      <div className="h-3 w-16 bg-gray-700 rounded" />
      <div className="h-3 w-24 bg-gray-700 rounded" />
    </div>
    <div className="w-full h-64 md:h-96 rounded-lg bg-gray-700 mb-6" />
    <div className="space-y-4">
      <div className="h-4 w-full bg-gray-700 rounded" />
      <div className="h-4 w-5/6 bg-gray-700 rounded" />
      <div className="h-4 w-2/3 bg-gray-700 rounded" />
      <div className="h-4 w-1/2 bg-gray-700 rounded" />
    </div>
    <div className="flex gap-2 mt-4">
      <div className="h-6 w-16 bg-gray-700 rounded-full" />
      <div className="h-6 w-16 bg-gray-700 rounded-full" />
    </div>
  </motion.article>
);

export default BlogPostContentSkeleton;
