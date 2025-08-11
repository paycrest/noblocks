"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import type { SanityPost } from "@/app/blog/types";
import { motion } from "framer-motion";
import { fadeBlur } from "@/app/components/blog/shared/animations";
import { trackBlogCardClick } from "@/app/hooks/analytics/useMixpanel";

interface FeaturedBlogProps {
  post: SanityPost;
}

const FeaturedBlog: React.FC<FeaturedBlogProps> = ({ post }) => {
  const handleFeaturedBlogClick = () => {
    trackBlogCardClick(post._id, post.title, "featured_blog");
  };

  return (
    <motion.div
      variants={fadeBlur}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <Link
        href={`/blog/${post.slug?.current || post._id}`}
        className="group flex cursor-pointer flex-col items-start gap-6 lg:flex-row lg:items-center lg:gap-20"
        prefetch={false}
        onMouseDown={handleFeaturedBlogClick}
      >
        <div className="mb-4 h-72 w-full flex-shrink-0 overflow-hidden rounded-lg sm:h-80 lg:mb-0 lg:w-[607px]">
          <Image
            src={post.mainImage || "https://unsplash.it/607/318?image=1001"}
            alt={post.title}
            width={607}
            height={318}
            sizes="(min-width: 1024px) 607px, 100vw"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            priority
          />
        </div>

        <div className="lg:w-md flex w-full flex-col gap-3">
          <h2 className="text-2xl font-semibold leading-9 text-text-body transition group-hover:text-lavender-500 dark:text-white sm:text-3xl sm:leading-10">
            {post.title}
          </h2>
          <p className="line-clamp-3 text-sm font-normal leading-normal text-text-secondary dark:text-white/50">
            {post.excerpt || (post.body ? String(post.body) : "")}
          </p>

          <div className="flex items-center gap-2 text-xs text-text-secondary dark:text-white/50">
            <span>{post.category?.title || "Uncategorized"}</span>
            <span className="inline-block h-[3px] w-[3px] rounded-full bg-gray-300 dark:bg-white/5" />
            <span>
              {new Date(post.publishedAt).toLocaleDateString("en-US", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
};

export default FeaturedBlog;
