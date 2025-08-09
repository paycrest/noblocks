"use client";

import React from "react";
import { motion } from "framer-motion";
import { fadeBlur } from "@/app/components/blog/shared/animations";

const BlogPostContentEmpty: React.FC = () => (
  <motion.div
    className="flex flex-col items-center justify-center py-24 w-full text-center"
    variants={fadeBlur}
    initial="initial"
    animate="animate"
    exit="exit"
  >
    <svg
      width="48"
      height="48"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.5"
      className="mb-4 text-gray-500"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 4.5v15m7.5-7.5h-15"
      />
    </svg>
    <h3 className="text-lg font-semibold text-gray-300 mb-2">
      Blog post not found
    </h3>
    <p className="text-gray-400">
      The blog post you are looking for does not exist or has been removed.
    </p>
  </motion.div>
);

export default BlogPostContentEmpty;
