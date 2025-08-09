"use client";

import React from "react";
import BlogCardSkeleton from "./blog-card-skeleton";
import { motion } from "framer-motion";
import { fadeBlur } from "@/app/components/blog/shared/animations";

const RecentBlogsSkeleton: React.FC = () => (
  <motion.div
    className="w-full"
    variants={fadeBlur}
    initial="initial"
    animate="animate"
    exit="exit"
  >
    <div className="flex gap-4 overflow-x-auto pb-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="min-w-[320px] max-w-xs flex-shrink-0">
          <BlogCardSkeleton />
        </div>
      ))}
    </div>
  </motion.div>
);

export default RecentBlogsSkeleton;
