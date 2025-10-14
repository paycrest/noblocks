"use client";

import React from "react";
import { motion } from "framer-motion";
import { fadeBlur } from "@/app/components/blog/shared/animations";

const BlogListError: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => (
  <motion.div
    className="flex w-full flex-col items-center justify-center py-16 text-center"
    variants={fadeBlur}
    initial="initial"
    animate="animate"
    exit="exit"
    role="alert"
    aria-live="assertive"
  >
    <svg
      width="48"
      height="48"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.5"
      className="mb-4 text-red-500"
      aria-hidden="true"
      focusable="false"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v2m0 4h.01M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z"
      />
    </svg>
    <h3 className="mb-2 text-lg font-semibold text-red-400">
      Failed to load blog posts
    </h3>
    <p className="text-gray-400">
      Something went wrong. Please try again later.
    </p>
    {onRetry && (
      <button
        type="button"
        className="mt-4 rounded-sm bg-red-500 px-3 py-1.5 text-sm text-white hover:bg-red-600"
        onClick={onRetry}
      >
        Try again
      </button>
    )}
  </motion.div>
);

export default BlogListError;
