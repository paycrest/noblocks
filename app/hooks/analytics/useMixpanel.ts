import { useEffect } from "react";
import { trackServerEvent, identifyServerUser } from "./useServerTracking";

// Type for event properties (replacing Dict from mixpanel-browser)
export type Dict = Record<string, any>;

// Get wallet address from localStorage if available
const getWalletAddress = (): string | undefined => {
  if (typeof window === "undefined") return undefined;
  return localStorage.getItem("userId") || undefined;
};

// No-op initialization (server-side tracking doesn't need client-side init)
export const initMixpanel = () => {
  // Server-side tracking - no client-side initialization needed
};

export const useMixpanel = () => {
  // Server-side tracking - no client-side initialization needed
  useEffect(() => {
    // Empty effect - kept for backward compatibility
  }, []);
};

/**
 * Identify a user server-side
 */
export const identifyUser = async (
  address: string,
  properties: {
    login_method: string | null;
    isNewUser: boolean;
    createdAt: Date | string;
    email?: { address: string } | null;
  },
) => {
  await identifyServerUser(address, properties);
};

/**
 * Track an event server-side
 */
export const trackEvent = async (eventName: string, properties: Dict = {}) => {
  const walletAddress = getWalletAddress();
  await trackServerEvent(
    eventName,
    { ...properties, app: "Noblocks" },
    walletAddress,
  );
};

// Blog-specific tracking functions
export const trackPageView = (pageName: string, properties: Dict = {}) => {
  trackEvent("Page Viewed", {
    ...properties,
    page_name: pageName,
    page_url: typeof window !== "undefined" ? window.location.href : "",
  });
};

export const trackBlogCardClick = (
  postId: string,
  postTitle: string,
  source: string,
  properties: Dict = {},
) => {
  trackEvent("Blog Card Clicked", {
    ...properties,
    post_id: postId,
    post_title: postTitle,
    source,
  });
};

export const trackBlogReadingStarted = (
  postId: string,
  postTitle: string,
  properties: Dict = {},
) => {
  trackEvent("Blog Reading Started", {
    ...properties,
    post_id: postId,
    post_title: postTitle,
  });
};

export const trackBlogReadingCompleted = (
  postId: string,
  postTitle: string,
  timeSpent?: number,
  properties: Dict = {},
) => {
  trackEvent("Blog Reading Completed", {
    ...properties,
    post_id: postId,
    post_title: postTitle,
    time_spent_seconds: timeSpent,
  });
};

export const trackCopyLink = (
  postId: string,
  postTitle: string,
  properties: Dict = {},
) => {
  trackEvent("Copy Link Clicked", {
    ...properties,
    post_id: postId,
    post_title: postTitle,
  });
};

export const trackGetStartedClick = (source: string, properties: Dict = {}) => {
  trackEvent("Get Started Clicked", {
    ...properties,
    source,
  });
};

export const trackRecentBlogClick = (
  postId: string,
  postTitle: string,
  sourcePostId: string,
  properties: Dict = {},
) => {
  trackEvent("Recent Blog Clicked", {
    ...properties,
    post_id: postId,
    post_title: postTitle,
    source_post_id: sourcePostId,
  });
};

export const trackSearch = (
  searchTerm: string,
  resultsCount: number,
  properties: Dict = {},
) => {
  trackEvent("Search Performed", {
    ...properties,
    search_term: searchTerm,
    results_count: resultsCount,
  });
};

export const trackFooterLinkClick = (
  linkText: string,
  linkUrl: string,
  properties: Dict = {},
) => {
  trackEvent("Footer Link Clicked", {
    ...properties,
    link_text: linkText,
    link_url: linkUrl,
  });
};

export const trackSocialShare = (
  platform: string,
  postId: string,
  postTitle: string,
  properties: Dict = {},
) => {
  trackEvent("Social Share Clicked", {
    ...properties,
    platform,
    post_id: postId,
    post_title: postTitle,
  });
};
