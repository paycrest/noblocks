"use client";

import React from "react";
import { motion } from "framer-motion";
import { fadeBlur } from "@/app/components/blog/shared/animations";

const FeaturedBlogSkeleton: React.FC = () => (
  <motion.div variants={fadeBlur} initial="initial" animate="animate">
    <div className="mb-8 flex w-full animate-pulse flex-col overflow-hidden rounded-xl bg-[#181A20] shadow-lg md:flex-row">
      <div className="h-64 w-full bg-gray-700 md:h-auto md:w-2/5" />
      <div className="flex flex-1 flex-col justify-between p-6">
        <div>
          <div className="mb-3 h-3 w-24 rounded bg-gray-700" />
          <div className="mb-4 h-7 w-3/4 rounded bg-gray-700" />
          <div className="mb-4 h-4 w-2/3 rounded bg-gray-700" />
        </div>
        <div className="mt-2 h-3 w-20 rounded bg-gray-700" />
      </div>
    </div>
  </motion.div>
);

export default FeaturedBlogSkeleton;
