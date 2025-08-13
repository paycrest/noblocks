"use client";

import React from "react";
import { motion } from "framer-motion";
import { fadeBlur } from "@/app/components/blog/shared/animations";

const BlogListEmpty: React.FC = () => (
  <motion.div
    className="flex w-full flex-col items-center justify-center py-16 text-center"
    variants={fadeBlur}
    initial="initial"
    animate="animate"
    exit="exit"
    role="status"
    aria-live="polite"
  >
    <svg
      width="48"
      height="48"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.5"
      className="mb-4 text-gray-500"
      aria-hidden="true"
      focusable="false"
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
    <h3 className="mb-2 text-lg font-semibold text-gray-300">
      No blog posts found
    </h3>
    <p className="text-gray-400">
      Try adjusting your search or filters to find what you&apos;re looking for.
    </p>
  </motion.div>
);

export default BlogListEmpty;
