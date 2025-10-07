"use client";
import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
  useLayoutEffect,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { SanityPost, SanityCategory } from "@/app/blog/types";
import {
  SearchingIcon,
  FilterIcon,
  Search01Icon,
  ArrowDown01Icon,
  Cancel01Icon,
} from "hugeicons-react";
import BlogCard from "@/app/components/blog/list/blog-card";
import FeaturedBlog from "@/app/components/blog/list/featured-blog";
import { SearchModal } from "@/app/components/blog/shared";
import {
  trackPageView,
  trackBlogCardClick,
} from "@/app/hooks/analytics/useMixpanel";

import { motion, AnimatePresence } from "framer-motion";
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

  // Mobile-only UI state
  const [isMobileCategoryOpen, setIsMobileCategoryOpen] =
    useState<boolean>(false);
  const [isMobileSearchActive, setIsMobileSearchActive] =
    useState<boolean>(false);
  const [mobileCategoryFilter, setMobileCategoryFilter] = useState<string>("");
  const mobileCategoryRef = useRef<HTMLDivElement | null>(null);
  const [mobileMenuPosition, setMobileMenuPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

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

  // Position mobile category menu when opened and on resize/scroll (pre-paint to prevent flicker)
  useLayoutEffect(() => {
    const updateMenuPosition = () => {
      if (!isMobileCategoryOpen) return;
      const container = mobileCategoryRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      setMobileMenuPosition({
        top: Math.round(rect.bottom + 160),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
      });
    };

    updateMenuPosition();
    if (isMobileCategoryOpen) {
      window.addEventListener("resize", updateMenuPosition, { passive: true });
      window.addEventListener("scroll", updateMenuPosition, { passive: true });
    }
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition);
    };
  }, [isMobileCategoryOpen]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      setIsSearchOpen(false);
      setShowSuggestions(false);

      // this Updates the  URL with search parameter
      const params = new URLSearchParams(searchParams.toString());
      if (search.trim()) {
        params.set("search", search.trim());
        // this Clears category when searching
        params.delete("category");
      } else {
        params.delete("search");
      }
      router.push(`/blog?${params.toString()}`);
    }
  };

  const handleSuggestionClick = (suggestion: { id: string; title: string }) => {
    //this Updates URL with search parameter
    const params = new URLSearchParams(searchParams.toString());
    params.set("search", suggestion.title);
    // this Clears category when searching
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
    // this Clears search when changing category
    params.delete("search");
    router.push(`/blog?${params.toString()}`);
  };

  //this Creates filter categories with "All Posts" option
  const filterCategories = useMemo(
    () => [{ _id: "all", title: "All Posts" }, ...categories],
    [categories],
  );

  // this Determines the active category - if there's a search, no category should be active
  const activeCategory = urlSearchValue ? null : selectedCategory;

  // these are Categories to display in mobile dropdown filtered by the mobile category filter
  const displayedCategories = useMemo(() => {
    const term = mobileCategoryFilter.trim().toLowerCase();
    if (!term) return filterCategories;
    return filterCategories.filter((c) => c.title.toLowerCase().includes(term));
  }, [filterCategories, mobileCategoryFilter]);

  // this Gets the first blog for featured section and rest for recent blogs
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
          className="relative mb-2 flex w-full items-center gap-2 overflow-visible sm:gap-6"
        >
          {/* Category Filter (Desktop/Tablet - scrollable chips) */}
          <div className="relative hidden min-w-0 flex-1 sm:block">
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

          {/* Category Selector + Search (Mobile) */}
          <div className="relative flex w-full flex-1 items-center gap-2 sm:hidden">
            {/* Collapsed state: category input + search icon */}
            {!isMobileSearchActive ? (
              <div className="flex w-full items-center gap-[20px]">
                <div
                  ref={mobileCategoryRef}
                  className="relative isolate z-[999999999] w-full"
                >
                  <div className="flex w-full items-center rounded-xl border border-gray-300 bg-white transition-colors hover:border-gray-400 dark:border-white/20 dark:bg-background-neutral/0 dark:hover:border-white/30">
                    <input
                      type="text"
                      className="flex-1 bg-transparent px-3 py-2 text-sm text-text-body placeholder-text-secondary outline-none dark:text-white dark:placeholder-white/30"
                      placeholder="Select category"
                      value={mobileCategoryFilter}
                      onChange={(e) => {
                        setMobileCategoryFilter(e.target.value);
                        if (!isMobileCategoryOpen) {
                          setIsMobileCategoryOpen(true);
                        }
                      }}
                      onFocus={() => setIsMobileCategoryOpen(true)}
                    />
                    <button
                      type="button"
                      aria-haspopup="listbox"
                      onClick={() => setIsMobileCategoryOpen((v) => !v)}
                      className="flex items-center justify-center px-3 py-2"
                    >
                      {/* Chevron Down */}
                      <ArrowDown01Icon className="h-4 w-4 text-gray-500 dark:text-white/60" />
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-gray-300 bg-white transition-colors hover:border-gray-400 dark:border-white/20 dark:bg-background-neutral/0 dark:hover:border-white/30"
                  onClick={() => {
                    setIsMobileSearchActive(true);
                    setIsSearchOpen(false);
                    setIsMobileCategoryOpen(false);
                    setMobileCategoryFilter("");
                    setSearch("");
                    setShowSuggestions(false);
                  }}
                  aria-label="Open search"
                >
                  <Search01Icon className="h-5 w-5 text-gray-400 dark:text-white/50" />
                </button>
              </div>
            ) : (
              // Expanded state: full-width search input
              <div className="flex w-full items-center gap-[20px]">
                <div className="flex h-[36px] w-full items-center rounded-xl border border-gray-300 bg-white py-2 pl-2.5 pr-2 transition-colors hover:border-gray-400 dark:border-white/20 dark:bg-background-neutral/0 dark:hover:border-white/30">
                  <Search01Icon className="h-4 w-4 text-gray-400 dark:text-white/50" />
                  <input
                    ref={searchInputRef}
                    type="search"
                    className="w-full flex-1 bg-transparent px-2.5 text-[14px] text-sm font-normal leading-[24px] text-text-body placeholder-text-secondary outline-none dark:text-white dark:placeholder-white/30"
                    placeholder="Search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      handleSearchKeyDown(e);
                      if (e.key === "Enter") {
                        setIsMobileSearchActive(false);
                      }
                    }}
                  />
                </div>
                <div className="">
                  <button
                    type="button"
                    className="flex h-[36px] w-[36px] flex-shrink-0 items-center justify-center rounded-xl border border-gray-300 bg-white transition-colors hover:border-gray-400 dark:border-white/20 dark:bg-background-neutral/0 dark:hover:border-white/30"
                    onClick={() => {
                      setIsMobileSearchActive(false);
                      setMobileCategoryFilter("");
                      setSearch("");
                    }}
                    aria-label="Close search"
                  >
                    <Cancel01Icon className="h-4 w-4 text-gray-500 dark:text-white/60" />
                  </button>
                </div>
              </div>
            )}
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
          {/* Search Icon (Mobile/Tablet) - replaced by inline mobile search above */}
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

      <AnimatePresence>
        {isMobileCategoryOpen ? (
          <>
            {/* backdrop to allow outside click close and ensure stacking */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[999999998] bg-black/40"
              onClick={() => setIsMobileCategoryOpen(false)}
            />
            <motion.div
              key="menu"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              role="listbox"
              className="fixed z-[999999999] overflow-hidden rounded-[24px] border border-white/10 bg-[#141414] p-5 shadow-2xl"
              style={{
                top: mobileMenuPosition?.top ?? 0,
                left: "2.5%",
                width: "95%",
              }}
            >
              <ul className="max-h-[70vh] divide-y divide-gray-100 overflow-auto dark:divide-white/5">
                <p className="py-[12px] text-[16px] font-[600] text-[#FFFFFF]">
                  Categories
                </p>
                {displayedCategories.length === 0 ? (
                  <li>
                    <div className="px-3 py-2 text-left text-sm text-text-body/60 dark:text-white/60">
                      No matching categories
                    </div>
                  </li>
                ) : null}
                {displayedCategories.map((cat) => (
                  <li key={cat._id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategory(cat._id);
                        setMobileCategoryFilter(
                          cat.title === "All Posts" ? "" : cat.title,
                        );
                        setIsMobileCategoryOpen(false);
                      }}
                      className={`flex w-full items-center justify-between py-[12px] text-left text-[14px] text-sm font-[500] text-[#FFFFFF] transition-colors hover:bg-gray-50 dark:hover:bg-white/5 ${
                        activeCategory === cat._id
                          ? "text-lavender-600 dark:text-white"
                          : "text-text-body/80 dark:text-white/80"
                      }`}
                    >
                      <span className="truncate">{cat.title}</span>
                      {activeCategory === cat._id ? (
                        <span className="ml-2 h-2 w-2 rounded-full bg-lavender-500" />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

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
