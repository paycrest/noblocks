"use client";
import React, { Suspense, useState, useRef, useEffect, useMemo } from "react";
import type { SanityPost } from "@/app/blog/types";
import Image from "next/image";
import Link from "next/link";
import { BlogCard } from "../list";
import BlogPostContent, { extractSections, resetSlugMap } from "./content";
import { BlogPostTableOfContents } from "./index";
import { FarcasterIcon } from "@/app/components/blog/icons/social-icons";
import { RiTwitterXFill } from "react-icons/ri";
import { FaLinkedinIn } from "react-icons/fa";
import { motion } from "framer-motion";
import { fadeBlur } from "@/app/components/blog/shared/animations";
import {
  trackPageView,
  trackCopyLink,
  trackGetStartedClick,
  trackRecentBlogClick,
  trackSocialShare,
} from "@/app/hooks/analytics/useMixpanel";
import { useBlogTracking } from "@/app/hooks/analytics/use-blog-tracking";
import { Crimson_Pro } from "next/font/google";
import { getBannerPadding } from "@/app/utils";
import { urlForImage } from "@/app/lib/sanity-client";
import config from "@/app/lib/config";

const crimsonPro = Crimson_Pro({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-crimson",
});

interface DetailClientProps {
  post: SanityPost;
  recent: SanityPost[];
}

export default function DetailClient({ post, recent }: DetailClientProps) {
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLElement>(null);

  // Track page view on mount
  useEffect(() => {
    if (!post) return;

    trackPageView("Blog Post", {
      post_id: post._id,
      post_title: post.title,
      post_category: post.category?.title || "Uncategorized",
      post_author: post.author.name,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?._id, post?.title, post?.category?.title, post?.author?.name]);

  // Extract sections from post content
  // Extract sections with slug map reset
  const sections = useMemo(() => {
    if (!post || !post.body) {
      return [];
    }
    return extractSections(post.body, true);
  }, [post]);

  // Track blog reading progress
  useBlogTracking({
    postId: post._id,
    postTitle: post.title,
    contentRef,
  });

  if (!post) {
    return (
      <div className="text-red-500">Post not found or failed to load.</div>
    );
  }

  const handleCopyLink = () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(window.location.href);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = window.location.href;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      trackCopyLink(post._id, post.title);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // no-op
    }
  };

  const handleGetStartedClick = () => {
    trackGetStartedClick("blog_post", {
      post_id: post._id,
      post_title: post.title,
    });
  };

  const handleSocialShare = (platform: string) => {
    const url = encodeURIComponent(window.location.href);
    const cleanText = `Check out this new blog on Noblocks: ${post.title}`;
    const shareText = encodeURIComponent(cleanText);

    let shareUrl = "";

    switch (platform) {
      case "twitter":
        shareUrl = `https://twitter.com/intent/tweet?text=${shareText}&url=${url}`;
        break;
      case "farcaster":
        shareUrl = `https://warpcast.com/~/compose?text=${shareText}%20${url}`;
        break;
      case "linkedin":
        shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${url}`;
        break;
      default:
        return;
    }

    // Track the share event
    trackSocialShare(platform, post._id, post.title);

    // Open the share URL in a new window
    window.open(
      shareUrl,
      "_blank",
      "width=600,height=400,scrollbars=yes,resizable=yes",
    );
  };

  const handleRecentBlogClick = (recentPost: SanityPost) => {
    trackRecentBlogClick(recentPost._id, recentPost.title, post._id);
  };

  return (
    <Suspense
      fallback={
        <div className="text-text-secondary dark:text-white/50">
          Loading post...
        </div>
      }
    >
      <div
        className={`mx-auto flex w-full max-w-screen-2xl flex-col gap-12 px-5 py-10 sm:px-8 ${getBannerPadding()}`}
      >
        {/* Main Content + Sidebar */}
        <div className="flex w-full flex-col gap-8 md:flex-row">
          {/* Main Content */}
          <motion.main
            ref={contentRef}
            className="min-w-0 flex-1 space-y-11 sm:space-y-8"
            variants={fadeBlur}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <h1 className="mb-4 text-3xl font-bold leading-tight text-text-body dark:text-white md:text-4xl">
              {post.title}
            </h1>
            {post.excerpt && (
              <p className="text-base text-text-secondary dark:text-white/50">
                Tl;dr: {post.excerpt}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary dark:text-white/50">
              <Image
                src={
                  typeof post.author.image === "string"
                    ? post.author.image
                    : urlForImage(post.author.image) ||
                      `https://picsum.photos/32/32?image=1005`
                }
                alt={post.author.name}
                width={24}
                height={24}
                className="size-6 rounded-full object-cover"
              />
              <span>{post.author.name}</span>
              <span className="inline-block h-[3px] w-[3px] rounded-full bg-white/5" />
              <Link
                href={`/blog?category=${post.category?._id || "all"}`}
                className="cursor-pointer underline underline-offset-2 transition duration-300 hover:text-lavender-500 hover:underline-offset-1"
              >
                {post.category?.title || "Uncategorized"}
              </Link>
              <span className="inline-block h-[3px] w-[3px] rounded-full bg-white/5" />
              <span>
                {new Date(post.publishedAt).toLocaleDateString("en-US", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
            {post.mainImage && (
              <div className="w-full overflow-hidden rounded-2xl">
                <Image
                  src={post.mainImage}
                  alt={post.title}
                  width={800}
                  height={400}
                  className="h-64 w-full object-cover md:h-96"
                  priority
                />
              </div>
            )}
            <BlogPostContent post={post} sections={sections} />
            {/* Start Swapping Promo */}
            <div className="relative flex flex-col items-center justify-center gap-6 overflow-hidden rounded-3xl bg-lavender-600 px-8 pb-20 pt-14 text-white">
              {/* Background illustration */}
              <Image
                src="/images/advert-bg.svg"
                alt="Promo background"
                fill
                style={{ objectFit: "cover", objectPosition: "bottom" }}
                className="pointer-events-none absolute inset-0 z-0 h-full w-full select-none"
                priority={false}
              />
              <div className="relative z-10 space-y-1 font-semibold">
                <h2 className="text-center text-2xl md:text-3xl">
                  Start swapping your stablecoins
                </h2>
                <p
                  className={`${crimsonPro.className} text-center text-[2.125rem] italic sm:text-[2.75rem] md:text-4xl`}
                >
                  to cash in seconds
                </p>
              </div>
              <Link
                href="/"
                className="relative z-10 cursor-pointer rounded-xl bg-white px-3 py-1.5 text-center text-sm font-medium text-black transition hover:bg-lavender-200"
                onClick={handleGetStartedClick}
              >
                Get started
              </Link>
            </div>
          </motion.main>
          {/* Sidebar (sticky, hidden on tablet and below) */}
          <motion.aside
            className="hidden w-80 flex-shrink-0 lg:block lg:pl-2"
            variants={fadeBlur}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div
              className={`sticky space-y-12 ${config.noticeBannerText ? "top-40" : "top-24"}`}
            >
              {/* Table of Contents */}
              <BlogPostTableOfContents sections={sections} />
              {/* Share Section */}
              <section className="flex flex-col items-start space-y-4 rounded-3xl border border-border-light bg-gray-50 p-4 text-sm shadow-xl dark:border-white/10 dark:bg-neutral-800">
                <h2 className="font-medium text-text-body dark:text-white">
                  Share this article
                </h2>
                <p className="text-text-secondary dark:text-white/50">
                  Send this article to others who might find it helpful.
                </p>
                <div className="flex gap-2">
                  {[
                    {
                      Icon: RiTwitterXFill,
                      label: "Share on X",
                      platform: "twitter",
                    },
                    {
                      Icon: FaLinkedinIn,
                      label: "Share on LinkedIn",
                      platform: "linkedin",
                    },
                    {
                      Icon: FarcasterIcon,
                      label: "Share on Farcaster",
                      platform: "farcaster",
                    },
                  ].map(({ Icon, label, platform }) => (
                    <button
                      key={label}
                      type="button"
                      aria-label={label}
                      className="flex size-7 cursor-pointer items-center justify-center rounded-full bg-gray-200 p-1.5 transition-colors duration-200 hover:bg-gray-300 dark:bg-white/10 dark:hover:bg-white/20"
                      onClick={() => handleSocialShare(platform)}
                    >
                      <Icon className="size-4 text-text-body dark:text-white" />
                    </button>
                  ))}
                </div>
                <div className="w-full border-t border-white/10" />
                <button
                  type="button"
                  className="w-full cursor-pointer rounded-xl bg-lavender-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-lavender-600"
                  aria-label="Copy link"
                  onClick={handleCopyLink}
                >
                  {copied ? "Copied" : "Copy link"}
                </button>
              </section>
            </div>
          </motion.aside>
        </div>
        {/* Recent Blogs (full width) */}
        <motion.div
          className="w-full space-y-10 pt-10"
          variants={fadeBlur}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {recent.length > 0 && (
            <h3 className="text-3xl font-bold text-text-body dark:text-white sm:text-4xl">
              Recent blogs
            </h3>
          )}
          <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((blog) => (
              <BlogCard
                key={blog._id}
                post={blog}
                onCardClick={() => handleRecentBlogClick(blog)}
              />
            ))}
          </div>
        </motion.div>
      </div>
    </Suspense>
  );
}
