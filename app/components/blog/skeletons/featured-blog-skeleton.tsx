"use client";

import React from "react";
import { motion } from "framer-motion";
import { fadeBlur } from "@/app/components/blog/shared/animations";

const FeaturedBlogSkeleton: React.FC = () => (
  <motion.div
    variants={fadeBlur}
    initial="initial"
    animate="animate"
    exit="exit"
  >
    <div className="flex flex-col md:flex-row bg-[#181A20] rounded-xl overflow-hidden shadow-lg mb-8 w-full animate-pulse">
      <div className="w-full md:w-2/5 h-64 md:h-auto bg-gray-700" />
      <div className="flex flex-col justify-between p-6 flex-1">
        <div>
          <div className="h-3 w-24 bg-gray-700 rounded mb-3" />
          <div className="h-7 w-3/4 bg-gray-700 rounded mb-4" />
          <div className="h-4 w-2/3 bg-gray-700 rounded mb-4" />
        </div>
        <div className="h-3 w-20 bg-gray-700 rounded mt-2" />
      </div>
    </div>
  </motion.div>
);

export default FeaturedBlogSkeleton;
