"use client";

import React from "react";
import { motion } from "framer-motion";
import { fadeBlur } from "@/app/components/blog/shared/animations";

const BlogPostSidebarSkeleton: React.FC = () => (
  <motion.aside
    className="w-full md:w-72 flex flex-col gap-8 md:sticky md:top-8 animate-pulse"
    variants={fadeBlur}
    initial="initial"
    animate="animate"
    exit="exit"
  >
    <div className="bg-[#181A20] rounded-xl p-4 shadow mb-4">
      <div className="h-4 w-24 bg-gray-700 rounded mb-3" />
      <div className="h-3 w-32 bg-gray-700 rounded mb-2" />
      <div className="h-3 w-24 bg-gray-700 rounded mb-2" />
      <div className="h-3 w-20 bg-gray-700 rounded" />
    </div>
    <div className="bg-[#181A20] rounded-xl p-4 shadow flex flex-col items-start">
      <div className="h-4 w-28 bg-gray-700 rounded mb-3" />
      <div className="flex gap-3 mb-3">
        <div className="h-8 w-8 bg-gray-700 rounded-full" />
        <div className="h-8 w-8 bg-gray-700 rounded-full" />
        <div className="h-8 w-8 bg-gray-700 rounded-full" />
      </div>
      <div className="h-8 w-full bg-gray-700 rounded" />
    </div>
  </motion.aside>
);

export default BlogPostSidebarSkeleton;
