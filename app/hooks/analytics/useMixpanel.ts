import { useEffect } from "react";
import config from "@/app/lib/config";
import mixpanel, { type Dict } from "mixpanel-browser";
import Cookies from "js-cookie";

const { mixpanelToken } = config;

let initialized = false;

export const initMixpanel = () => {
  if (initialized) return;

  const consent = Cookies.get("cookieConsent");
  if (!consent || !JSON.parse(consent).analytics) {
    console.warn("User has not consented to analytics cookies");
    return;
  }

  if (mixpanelToken) {
    mixpanel.init(mixpanelToken, {
      persistence: "localStorage",
      ignore_dnt: true,
    });

    initialized = true;
  } else {
    console.warn("Mixpanel token is not defined");
  }
};

export const useMixpanel = () => {
  useEffect(() => {
    const handleConsentChange = () => {
      const consent = Cookies.get("cookieConsent");
      if (consent && JSON.parse(consent).analytics) {
        initMixpanel();
      }
    };

    window.addEventListener("cookieConsent", handleConsentChange);
    handleConsentChange();

    return () => {
      window.removeEventListener("cookieConsent", handleConsentChange);
    };
  }, []);
};

export const identifyUser = (
  address: string,
  properties: {
    login_method: string | null;
    isNewUser: boolean;
    createdAt: Date | string;
    email?: { address: string } | null;
  },
) => {
  if (!initialized) {
    console.warn("Mixpanel not initialized");
    return;
  }

  const consent = Cookies.get("cookieConsent");
  if (!consent || !JSON.parse(consent).analytics) {
    return;
  }

  mixpanel.identify(address);
  mixpanel.people.set({
    login_method: properties.login_method || "unknown",
    $last_login: new Date(),
    $signup_date: properties.createdAt,
    $email: properties.email?.address,
    isNewUser: properties.isNewUser,
  });
};

export const trackEvent = (
  eventName: string,
  properties?: Dict | undefined,
) => {
  if (!initialized) {
    console.warn("Mixpanel not initialized");
    return;
  }
  mixpanel.track(eventName, { app: "Noblocks", ...properties });
};

// Blog-specific tracking functions
export const trackPageView = (pageName: string, properties?: Dict) => {
  trackEvent("Page Viewed", {
    page_name: pageName,
    page_url: typeof window !== "undefined" ? window.location.href : "",
    ...properties,
  });
};

export const trackBlogCardClick = (
  postId: string,
  postTitle: string,
  source: string,
  properties?: Dict
) => {
  trackEvent("Blog Card Clicked", {
    post_id: postId,
    post_title: postTitle,
    source,
    ...properties,
  });
};

export const trackBlogReadingStarted = (
  postId: string,
  postTitle: string,
  properties?: Dict
) => {
  trackEvent("Blog Reading Started", {
    post_id: postId,
    post_title: postTitle,
    ...properties,
  });
};

export const trackBlogReadingCompleted = (
  postId: string,
  postTitle: string,
  timeSpent?: number,
  properties?: Dict
) => {
  trackEvent("Blog Reading Completed", {
    post_id: postId,
    post_title: postTitle,
    time_spent_seconds: timeSpent,
    ...properties,
  });
};

export const trackCopyLink = (
  postId: string,
  postTitle: string,
  properties?: Dict
) => {
  trackEvent("Copy Link Clicked", {
    post_id: postId,
    post_title: postTitle,
    ...properties,
  });
};

export const trackGetStartedClick = (source: string, properties?: Dict) => {
  trackEvent("Get Started Clicked", {
    source,
    ...properties,
  });
};

export const trackRecentBlogClick = (
  postId: string,
  postTitle: string,
  sourcePostId: string,
  properties?: Dict
) => {
  trackEvent("Recent Blog Clicked", {
    post_id: postId,
    post_title: postTitle,
    source_post_id: sourcePostId,
    ...properties,
  });
};

export const trackSearch = (
  searchTerm: string,
  resultsCount: number,
  properties?: Dict
) => {
  trackEvent("Search Performed", {
    search_term: searchTerm,
    results_count: resultsCount,
    ...properties,
  });
};

export const trackFooterLinkClick = (
  linkText: string,
  linkUrl: string,
  properties?: Dict
) => {
  trackEvent("Footer Link Clicked", {
    link_text: linkText,
    link_url: linkUrl,
    ...properties,
  });
};

export const trackSocialShare = (
  platform: string,
  postId: string,
  postTitle: string,
  properties?: Dict
) => {
  trackEvent("Social Share Clicked", {
    platform,
    post_id: postId,
    post_title: postTitle,
    ...properties,
  });
};
