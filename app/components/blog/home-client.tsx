"use client";
import React, { useEffect, useMemo, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { SanityPost, SanityCategory } from "@/app/blog/types";
import { SearchingIcon, FilterIcon, Search01Icon } from "hugeicons-react";
import BlogCard from "@/app/components/blog/list/blog-card";
import FeaturedBlog from "@/app/components/blog/list/featured-blog";
import { SearchModal } from "@/app/components/blog/shared";
import {
  trackPageView,
  trackBlogCardClick,
} from "@/app/hooks/analytics/useMixpanel";

import { motion } from "framer-motion";
import { fadeBlur } from "@/app/components/blog/shared/animations";
import { getBannerPadding } from "@/app/utils";

interface HomeClientProps {
  blogPosts: SanityPost[];
  categories: SanityCategory[];
}

export default function HomeClient({ blogPosts, categories }: HomeClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Search state
  const [search, setSearch] = useState<string>("");
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<
    { id: string; title: string }[]
  >([]);

  // Track page view on mount
  useEffect(() => {
    trackPageView("Blog Home");
  }, []);

  // Get filter parameters from URL
  const selectedCategory = searchParams.get("category") || "all";
  const urlSearchValue = searchParams.get("search") || "";

  // Update filtered suggestions when search changes
  useEffect(() => {
    if (search) {
      const suggestions = blogPosts
        .filter((post) =>
          post.title.toLowerCase().includes(search.toLowerCase()),
        )
        .map((post) => ({ id: post._id, title: post.title }));
      setFilteredSuggestions(suggestions);
    } else {
      setFilteredSuggestions([]);
    }
  }, [search, blogPosts]);

  // Filter blogs based on URL parameters
  const filteredBlogs = useMemo(() => {
    return blogPosts.filter((post) => {
      const matchesSearch =
        !urlSearchValue ||
        post.title.toLowerCase().includes(urlSearchValue.toLowerCase()) ||
        post.excerpt?.toLowerCase().includes(urlSearchValue.toLowerCase());

      const matchesCategory =
        selectedCategory === "all" || post.category?._id === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [blogPosts, selectedCategory, urlSearchValue]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      setSearch("");
      setIsSearchOpen(false);
      setShowSuggestions(false);

      // Update URL with search parameter
      const params = new URLSearchParams(searchParams.toString());
      if (search.trim()) {
        params.set("search", search.trim());
        // Clear category when searching
        params.delete("category");
      } else {
        params.delete("search");
      }
      router.push(`/blog?${params.toString()}`);
    }
  };

  const handleSuggestionClick = (suggestion: { id: string; title: string }) => {
    // Update URL with search parameter
    const params = new URLSearchParams(searchParams.toString());
    params.set("search", suggestion.title);
    // Clear category when searching
    params.delete("category");
    router.push(`/blog?${params.toString()}`);
  };

  const setSelectedCategory = (categoryId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (categoryId === "all") {
      params.delete("category");
    } else {
      params.set("category", categoryId);
    }
    // Clear search when changing category
    params.delete("search");
    router.push(`/blog?${params.toString()}`);
  };

  // Create filter categories with "All Posts" option
  const filterCategories = [{ _id: "all", title: "All Posts" }, ...categories];

  // Determine the active category - if there's a search, no category should be active
  const activeCategory = urlSearchValue ? null : selectedCategory;

  // Get the first blog for featured section and rest for recent blogs
  const firstBlog = filteredBlogs[0];
  const recentBlogs = filteredBlogs.slice(1);

  return (
    <div className="w-full">
      <main
        className={`mx-auto flex w-full max-w-screen-2xl flex-col gap-11 px-5 py-14 sm:gap-10 sm:px-8 ${getBannerPadding()}`}
      >
        {/* Hero Title & Description or Search Result */}
        <motion.div
          variants={fadeBlur}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {urlSearchValue ? (
            <div className="space-y-2 pb-4">
              <span className="text-sm font-medium text-text-secondary dark:text-white/50">
                Search result
              </span>
              <h1 className="text-3xl font-bold leading-10 text-text-body dark:text-white sm:text-4xl">
                &ldquo;{urlSearchValue}&rdquo;
              </h1>
            </div>
          ) : (
            <div className="space-y-4 pb-4">
              <h1 className="text-3xl font-bold leading-10 text-text-body dark:text-white sm:text-4xl">
                Blog
              </h1>
              <p className="text-sm font-normal leading-tight text-text-secondary dark:text-white/50">
                Discover more about Noblocks, our innovative approach to
                authentication, and the latest updates from our company.
              </p>
            </div>
          )}
        </motion.div>

        {/* Filters & Search */}
        <motion.div
          variants={fadeBlur}
          initial="initial"
          animate="animate"
          exit="exit"
          className="relative mb-2 flex w-full items-center gap-2 sm:gap-6"
        >
          {/* Category Filter Scrollable Row */}
          <div className="relative min-w-0 flex-1">
            <div className="scrollbar-hide flex gap-2 overflow-x-auto whitespace-nowrap pr-4">
              {filterCategories.map((cat) => (
                <button
                  key={cat._id}
                  type="button"
                  onClick={() => setSelectedCategory(cat._id)}
                  className={`cursor-pointer whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium leading-normal transition-colors ${
                    activeCategory === cat._id
                      ? "bg-lavender-500 text-white shadow-sm dark:bg-white/10"
                      : "bg-transparent text-text-body/80 hover:bg-gray-100 dark:text-white/80 dark:hover:bg-white/5"
                  }`}
                >
                  {cat.title}
                </button>
              ))}
            </div>
          </div>
          {/* Search Bar (Desktop) */}
          <div className="hidden w-full min-w-[200px] max-w-[300px] flex-shrink-0 sm:flex">
            <div
              className="flex w-full cursor-pointer items-center rounded-xl border border-gray-300 bg-white py-2 pl-2.5 transition-colors hover:border-gray-400 dark:border-white/20 dark:bg-background-neutral/0 dark:hover:border-white/30"
              onClick={() => {
                setIsSearchOpen(true);
                setSearch("");
                setShowSuggestions(false);
              }}
            >
              <Search01Icon className="h-4 w-4 text-gray-400 dark:text-white/50" />
              <input
                type="search"
                className="w-full flex-1 cursor-pointer bg-transparent px-2.5 text-sm font-normal text-text-body placeholder-text-secondary outline-none dark:text-white dark:placeholder-white/30"
                placeholder="Search"
                value={search}
                readOnly
              />
            </div>
          </div>
          {/* Search Icon (Mobile/Tablet) */}
          <div className="ml-2 flex flex-shrink-0 sm:hidden">
            {!isSearchOpen ? (
              <button
                type="button"
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-gray-300 bg-white transition-colors hover:border-gray-400 dark:border-white/20 dark:bg-background-neutral/0 dark:hover:border-white/30"
                onClick={() => {
                  setIsSearchOpen(true);
                  setSearch("");
                  setShowSuggestions(false);
                }}
                aria-label="Open search"
              >
                <Search01Icon className="h-5 w-5 text-gray-400 dark:text-white/50" />
              </button>
            ) : null}
          </div>
        </motion.div>

        {/* Featured Blog (hide in search mode) */}
        {!urlSearchValue && firstBlog ? (
          <motion.div
            variants={fadeBlur}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <FeaturedBlog post={firstBlog} />
          </motion.div>
        ) : null}

        {/* Blog List or Search Results */}
        <motion.div
          variants={fadeBlur}
          initial="initial"
          animate="animate"
          exit="exit"
          className="flex w-full flex-col gap-10"
        >
          {urlSearchValue
            ? null
            : recentBlogs.length > 0 && (
                <h2 className="text-3xl font-bold leading-10 text-text-body dark:text-white">
                  Recent blogs
                </h2>
              )}
          {(
            urlSearchValue ? filteredBlogs.length > 0 : recentBlogs.length > 0
          ) ? (
            <div
              className={
                urlSearchValue
                  ? "flex flex-col gap-8"
                  : "grid grid-cols-1 gap-x-10 gap-y-12 sm:grid-cols-2 sm:gap-y-8 lg:grid-cols-3"
              }
            >
              {urlSearchValue
                ? filteredBlogs.map((blog) => (
                    <BlogCard
                      key={blog._id}
                      post={blog}
                      layout="horizontal"
                      onCardClick={() =>
                        trackBlogCardClick(
                          blog._id,
                          blog.title,
                          "search_results",
                        )
                      }
                    />
                  ))
                : recentBlogs.map((blog) => (
                    <BlogCard
                      key={blog._id}
                      post={blog}
                      onCardClick={() =>
                        trackBlogCardClick(blog._id, blog.title, "home_page")
                      }
                    />
                  ))}
            </div>
          ) : !firstBlog ? (
            <div className="flex w-full flex-col items-center justify-center gap-3 py-16">
              {urlSearchValue ? (
                <span className="mb-2 inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
                  <SearchingIcon className="h-8 w-8 text-lavender-500" />
                </span>
              ) : (
                <span className="mb-2 inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
                  <FilterIcon className="h-8 w-8 text-lavender-500" />
                </span>
              )}
              <span className="text-sm font-medium text-text-secondary dark:text-white/80">
                {urlSearchValue
                  ? "No results found for your search."
                  : "No posts found for this category."}
              </span>
              <span className="text-sm text-text-secondary dark:text-white/50">
                {urlSearchValue
                  ? "Try a different search term."
                  : "Try a different category."}
              </span>
            </div>
          ) : null}
        </motion.div>
      </main>

      {/* Search Modal */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => {
          setIsSearchOpen(false);
          setShowSuggestions(false);
        }}
        search={search}
        setSearch={setSearch}
        searchInputRef={searchInputRef}
        showSuggestions={showSuggestions}
        setShowSuggestions={setShowSuggestions}
        filteredSuggestions={filteredSuggestions}
        setIsModalOpen={setIsSearchOpen}
        inputAutoFocus={true}
        handleSearchKeyDown={handleSearchKeyDown}
        onSuggestionClick={handleSuggestionClick}
      />
    </div>
  );
}
