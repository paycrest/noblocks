"use client";

import React from "react";
import type { SanityPost } from "@/app/blog/types";
import type { PortableTextBlock } from "@portabletext/types";
import { motion } from "framer-motion";
import { fadeBlur } from "@/app/components/blog/shared/animations";
import { PortableText, PortableTextComponents } from "@portabletext/react";
import { urlForImage } from "@/app/lib/sanity-client";
import Image from "next/image";
import config from "@/app/lib/config";

// Map to track generated slugs and their counts
const slugMap = new Map<string, number>();

// Helper function to reset slug map (call before rendering new content)
export const resetSlugMap = (): void => {
  slugMap.clear();
};

// Helper function to generate unique slug from text
const generateSlug = (text: string): string => {
  const baseSlug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  // Check if this slug already exists
  if (slugMap.has(baseSlug)) {
    const count = slugMap.get(baseSlug)! + 1;
    slugMap.set(baseSlug, count);
    return `${baseSlug}-${count}`;
  } else {
    slugMap.set(baseSlug, 0);
    return baseSlug;
  }
};

// Helper function to find ID from sections by title
const findIdFromSections = (
  text: string,
  sections?: Array<{ id: string; title: string }>,
): string | null => {
  if (!sections) return null;
  const section = sections.find((s) => s.title === text);
  return section?.id || null;
};

// Helper function to extract text from PortableText children
const extractTextFromChildren = (children: React.ReactNode): string => {
  if (typeof children === "string") {
    return children;
  }

  if (Array.isArray(children)) {
    return children.map((child) => extractTextFromChildren(child)).join("");
  }

  if (children && typeof children === "object" && "props" in children) {
    const childWithProps = children as {
      props: { children?: React.ReactNode };
    };
    return extractTextFromChildren(childWithProps.props.children);
  }

  return "";
};

// Helper function to extract sections from PortableText content
export const extractSections = (
  body: PortableTextBlock[],
  resetSlugMapFirst: boolean = false,
): Array<{ id: string; title: string }> => {
  if (resetSlugMapFirst) {
    resetSlugMap();
  }

  const sections: Array<{ id: string; title: string }> = [];

  const traverseBlocks = (blocks: PortableTextBlock[]) => {
    blocks.forEach((block) => {
      if (
        block._type === "block" &&
        block.style &&
        ["h1", "h2", "h3", "h4"].includes(block.style)
      ) {
        const text =
          block.children
            ?.map((child) => ("text" in child ? child.text : ""))
            .join("") || "";
        if (text.trim()) {
          const id = generateSlug(text);
          sections.push({ id, title: text });
        }
      }
      // Only traverse children if they are not block elements with styles
      // This prevents double-counting headings that might be nested
      if ("children" in block && block.children && block._type !== "block") {
        traverseBlocks(block.children as PortableTextBlock[]);
      }
    });
  };

  traverseBlocks(body);
  return sections;
};

const createPtComponents = (
  sections?: Array<{ id: string; title: string }>,
): PortableTextComponents => ({
  types: {
    image: ({ value }) => {
      // Check if we have a valid asset reference
      if (!value?.asset?._ref) {
        return null;
      }

      // Generate the image URL
      const imageUrl = urlForImage(value);

      if (!imageUrl) {
        return null;
      }

      return (
        <div className="my-6">
          <div className="relative h-auto w-full">
            <Image
              alt={value.alt || "Blog post image"}
              src={imageUrl}
              fill
              sizes="(min-width: 768px) 800px, 100vw"
              className="h-auto w-full max-w-full rounded-2xl object-cover"
              priority={false}
            />
          </div>
          {value.caption && (
            <p className="mt-2 text-center text-xs italic text-text-secondary dark:text-white/50">
              {value.caption}
            </p>
          )}
        </div>
      );
    },
  },
  marks: {
    link: ({ children, value }) => {
      const isExternal = /^https?:\/\//i.test(value.href || "");
      return (
        <a
          href={value.href}
          {...(isExternal
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {})}
          className="text-lavender-400 underline underline-offset-2 transition duration-300 hover:underline-offset-1"
        >
          {children}
        </a>
      );
    },
  },
  block: {
    h1: ({ children }) => {
      // Properly extract text from PortableText children
      const text = extractTextFromChildren(children);
      const id = generateSlug(text);
      return (
        <h1
          id={id}
          className={`mb-4 mt-6 text-2xl font-bold text-text-body first:mt-0 dark:text-white ${config.noticeBannerText ? "scroll-mt-32" : "scroll-mt-20"}`}
        >
          {children}
        </h1>
      );
    },
    h2: ({ children }) => {
      // Properly extract text from PortableText children
      const text = extractTextFromChildren(children);

      // Try to find ID from sections first, fallback to generateSlug
      const sectionId = findIdFromSections(text, sections);
      const id = sectionId || generateSlug(text);
      return (
        <h2
          id={id}
          className={`mb-3 mt-5 text-xl font-bold text-text-body first:mt-0 dark:text-white ${config.noticeBannerText ? "scroll-mt-32" : "scroll-mt-20"}`}
        >
          {children}
        </h2>
      );
    },
    h3: ({ children }) => {
      // Properly extract text from PortableText children
      const text = extractTextFromChildren(children);

      // Try to find ID from sections first, fallback to generateSlug
      const sectionId = findIdFromSections(text, sections);
      const id = sectionId || generateSlug(text);
      return (
        <h3
          id={id}
          className={`mb-2 mt-4 text-lg font-bold text-text-body first:mt-0 dark:text-white ${config.noticeBannerText ? "scroll-mt-32" : "scroll-mt-20"}`}
        >
          {children}
        </h3>
      );
    },
    h4: ({ children }) => {
      // Properly extract text from PortableText children
      const text = extractTextFromChildren(children);
      const id = generateSlug(text);
      return (
        <h4
          id={id}
          className={`mb-2 mt-3 text-base font-bold text-text-body first:mt-0 dark:text-white ${config.noticeBannerText ? "scroll-mt-32" : "scroll-mt-20"}`}
        >
          {children}
        </h4>
      );
    },
    blockquote: ({ children }) => (
      <blockquote className="my-4 rounded-sm border-l-4 border-lavender-500 pl-4 text-sm italic text-text-secondary dark:text-white/50">
        {children}
      </blockquote>
    ),
    code: ({ children }) => (
      <pre className="my-4 overflow-x-auto rounded-lg bg-gray-100 p-3 dark:bg-white/10">
        <code className="text-sm text-text-body dark:text-white/90">
          {children}
        </code>
      </pre>
    ),
    normal: ({ children }) => (
      <p className="mb-4 text-sm leading-6 text-text-body last:mb-0 dark:text-white/80">
        {children}
      </p>
    ),
  },
  list: {
    bullet: ({ children }) => (
      <ul className="mb-4 list-inside list-disc space-y-1 text-sm leading-6 text-text-body dark:text-white/80">
        {children}
      </ul>
    ),
    number: ({ children }) => (
      <ol className="mb-4 list-inside list-decimal space-y-1 text-sm leading-6 text-text-body dark:text-white/80">
        {children}
      </ol>
    ),
  },
  listItem: ({ children }) => (
    <li className="text-sm leading-6 text-text-body dark:text-white/80">
      {children}
    </li>
  ),
});

interface BlogPostContentProps {
  post: SanityPost;
  sections?: Array<{ id: string; title: string }>;
}

const BlogPostContent: React.FC<BlogPostContentProps> = ({
  post,
  sections,
}) => {
  // Note: Slug map is reset in DetailClient before extraction
  // to ensure consistency between extraction and rendering

  return (
    <motion.section {...fadeBlur} className="w-full" suppressHydrationWarning>
      {post.body ? (
        <PortableText
          value={post.body}
          components={createPtComponents(sections)}
        />
      ) : (
        <p className="text-sm leading-6 text-text-body dark:text-white/80">
          {post.excerpt}
        </p>
      )}
    </motion.section>
  );
};

export default BlogPostContent;
