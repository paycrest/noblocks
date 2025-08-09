"use client";

import React from "react";
import type { SanityPost } from "@/app/blog/types";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { fadeBlur } from "@/app/components/blog/shared/animations";

interface BlogCardProps {
  post: SanityPost;
  layout?: "vertical" | "horizontal";
  onCardClick?: () => void;
}

const BlogCard: React.FC<BlogCardProps> = ({
  post,
  layout = "vertical",
  onCardClick,
}) => {
  // Use slug for routing
  const postSlug = post.slug?.current || post._id;
  const mainImage = post.mainImage || "https://unsplash.it/400/200?image=1001";
  const category = post.category?.title || "Uncategorized";

  const handleCardClick = () => {
    onCardClick?.();
  };

  if (layout === "horizontal") {
    return (
      <motion.div
        variants={fadeBlur}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        <Link
          href={`/blog/${postSlug}`}
          className="group flex w-full cursor-pointer flex-col items-center gap-6 lg:flex-row lg:gap-20"
          prefetch={false}
          onClick={handleCardClick}
        >
          <div className="relative h-48 w-full flex-shrink-0 overflow-hidden rounded-lg bg-accent-gray/5 lg:h-52 lg:w-96">
            <Image
              src={mainImage}
              alt={post.title}
              width={413}
              height={216}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              priority={false}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-start justify-start gap-3">
            <div className="line-clamp-2 w-full text-xl font-semibold leading-7 text-text-body transition group-hover:text-lavender-500 dark:text-white lg:text-2xl lg:leading-9">
              {post.title}
            </div>
            <div className="line-clamp-2 w-full text-sm font-normal leading-tight text-text-secondary dark:text-white/50">
              {post.excerpt?.length && post.excerpt.length > 120
                ? post.excerpt.slice(0, 120) + "..."
                : post.excerpt || (post.body ? String(post.body) : "")}
            </div>
            <div className="mt-1 flex w-full items-center justify-start gap-2">
              <div className="text-xs font-normal leading-none text-text-secondary dark:text-white/50">
                {category}
              </div>
              <div className="h-[3px] w-[3px] rounded-full bg-gray-300 dark:bg-white/5" />
              <div className="text-xs font-normal leading-none text-text-secondary dark:text-white/50">
                {new Date(post.publishedAt).toLocaleDateString("en-US", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </div>
            </div>
          </div>
        </Link>
      </motion.div>
    );
  }
  // Default vertical layout
  return (
    <motion.div
      variants={fadeBlur}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <Link
        href={`/blog/${postSlug}`}
        className="group flex cursor-pointer flex-col gap-3.5"
        prefetch={false}
        onClick={handleCardClick}
      >
        <div className="relative h-64 overflow-hidden rounded-lg bg-accent-gray/5">
          <Image
            src={mainImage}
            alt={post.title}
            width={506}
            height={506}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            priority={false}
          />
        </div>
        <span className="text-xs font-medium leading-none text-lavender-500">
          {category}
        </span>
        <div className="flex flex-col gap-1.5">
          <h3 className="line-clamp-3 text-lg font-semibold leading-normal text-text-body transition group-hover:text-lavender-500 dark:text-white">
            {post.title}
          </h3>
          <span className="text-xs font-medium leading-none text-text-secondary dark:text-white/50">
            {new Date(post.publishedAt).toLocaleDateString("en-US", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>
      </Link>
    </motion.div>
  );
};

export default BlogCard;
