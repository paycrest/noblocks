"use client";

import React from "react";
import { motion } from "framer-motion";
import { fadeBlur } from "@/app/components/blog/shared/animations";

const BlogListEmpty: React.FC = () => (
  <motion.div
    className="flex flex-col items-center justify-center py-16 w-full text-center"
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
        d="M19.5 17.25V6.75A2.25 2.25 0 0 0 17.25 4.5H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5A2.25 2.25 0 0 0 6.75 19.5h10.5A2.25 2.25 0 0 0 19.5 17.25z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.25 9.75h7.5M8.25 12h7.5M8.25 14.25h4.5"
      />
    </svg>
    <h3 className="text-lg font-semibold text-gray-300 mb-2">
      No blog posts found
    </h3>
    <p className="text-gray-400">
      Try adjusting your search or filters to find what you&apos;re looking for.
    </p>
  </motion.div>
);

export default BlogListEmpty;
