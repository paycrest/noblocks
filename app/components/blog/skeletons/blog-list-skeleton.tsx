"use client";

import React from "react";
import BlogCardSkeleton from "./blog-card-skeleton";
import { motion } from "framer-motion";
import { fadeBlur } from "@/app/components/blog/shared/animations";

const BlogListSkeleton: React.FC = () => (
  <motion.div
    className="flex flex-col items-center w-full"
    variants={fadeBlur}
    initial="initial"
    animate="animate"
    exit="exit"
  >
    {[...Array(6)].map((_, i) => (
      <BlogCardSkeleton key={i} />
    ))}
  </motion.div>
);

export default BlogListSkeleton;
