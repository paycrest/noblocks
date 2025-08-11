"use client";

import React from "react";
import { motion } from "framer-motion";
import { fadeBlur } from "@/app/components/blog/shared/animations";

const PostContentError: React.FC = () => (
  <motion.div
    className="flex w-full flex-col items-center justify-center py-24 text-center"
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
      Failed to load blog post
    </h3>
    <p className="text-gray-400">
      Something went wrong. Please try again later.
    </p>
  </motion.div>
);

export default PostContentError;
