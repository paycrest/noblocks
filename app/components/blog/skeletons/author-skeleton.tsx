"use client";

import React from "react";
import { motion } from "framer-motion";
import { fadeBlur } from "@/app/components/blog/shared/animations";

const BlogPostAuthorSkeleton: React.FC = () => (
  <motion.section
    className="flex items-center gap-4 mt-8 mb-8 bg-[#181A20] rounded-xl p-4 shadow w-full max-w-2xl mx-auto animate-pulse"
    variants={fadeBlur}
    initial="initial"
    animate="animate"
    exit="exit"
  >
    <div className="w-14 h-14 rounded-full bg-gray-700" />
    <div>
      <div className="h-4 w-32 bg-gray-700 rounded mb-2" />
      <div className="h-3 w-24 bg-gray-700 rounded" />
    </div>
  </motion.section>
);

export default BlogPostAuthorSkeleton;
