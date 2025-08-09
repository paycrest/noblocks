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
  >
    <div className="flex bg-[#181A20] rounded-xl overflow-hidden shadow-md mb-8 max-w-2xl w-full animate-pulse">
      <div className="w-48 h-32 flex-shrink-0 bg-gray-700" />
      <div className="flex flex-col justify-between p-4 flex-1">
        <div>
          <div className="h-3 w-20 bg-gray-700 rounded mb-2" />
          <div className="h-5 w-3/4 bg-gray-700 rounded mb-2" />
          <div className="h-4 w-1/2 bg-gray-700 rounded" />
        </div>
        <div className="h-3 w-16 bg-gray-700 rounded mt-2" />
      </div>
    </div>
  </motion.div>
);

export default BlogCardSkeleton;
