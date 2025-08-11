"use client";

import React from "react";
import Image from "next/image";
import type { SanityAuthor } from "@/app/blog/types";
import { urlForImage } from "@/app/lib/sanity-client";
import { motion } from "framer-motion";
import { fadeBlur } from "@/app/components/blog/shared/animations";

interface BlogPostAuthorProps {
  author: SanityAuthor;
}

const BlogPostAuthor: React.FC<BlogPostAuthorProps> = ({ author }) => {
  const imageUrl = author.image
    ? typeof author.image === "string"
      ? author.image
      : urlForImage(author.image) || "https://unsplash.it/56/56?image=1008"
    : "https://unsplash.it/56/56?image=1008";
  return (
    <motion.section
      className="mx-auto mb-8 mt-8 flex w-full max-w-2xl items-center gap-4 rounded-xl bg-[#181A20] p-4 shadow"
      variants={fadeBlur}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <Image
        src={imageUrl}
        alt={author.name}
        width={56}
        height={56}
        className="h-14 w-14 rounded-full border-2 border-blue-600 object-cover"
      />
      <div>
        <div className="text-lg font-semibold text-white">{author.name}</div>
        {author.bio?.length && (
          <div className="mt-1 text-sm text-gray-400">
            {/* TODO: render PortableText here */}
          </div>
        )}
      </div>
    </motion.section>
  );
};

export default BlogPostAuthor;
