"use client";

import React from "react";
import { motion } from "framer-motion";
import { fadeBlur } from "@/app/components/blog/shared/animations";

const BlogCardSkeleton: React.FC = () => (
  <motion.div
    variants={fadeBlur}
    initial="initial"
    animate="animate"
    exit="exit"
    aria-hidden="true"
  >
    <div className="bg-card mb-8 flex w-full max-w-2xl overflow-hidden rounded-xl shadow-md motion-safe:animate-pulse">
      <div className="bg-muted h-32 w-48 flex-shrink-0" />
      <div className="flex flex-1 flex-col justify-between p-4">
        <div>
          <div className="bg-muted mb-2 h-3 w-20 rounded" />
          <div className="bg-muted mb-2 h-5 w-3/4 rounded" />
          <div className="bg-muted h-4 w-1/2 rounded" />
        </div>
        <div className="bg-muted mt-2 h-3 w-16 rounded" />
      </div>
    </div>
  </motion.div>
);

export default BlogCardSkeleton;
