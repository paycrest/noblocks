"use client";

import { useEffect, useRef, useState } from "react";
import {
  trackBlogReadingStarted,
  trackBlogReadingCompleted,
} from "./useMixpanel";

interface UseBlogTrackingProps {
  postId: string;
  postTitle: string;
  contentRef?: React.RefObject<HTMLElement | null>;
}

export const useBlogTracking = ({
  postId,
  postTitle,
  contentRef,
}: UseBlogTrackingProps) => {
  const [hasStartedReading, setHasStartedReading] = useState(false);
  const [hasCompletedReading, setHasCompletedReading] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track when user starts reading (first scroll or interaction)
  useEffect(() => {
    if (hasStartedReading) return;

    const handleStartReading = () => {
      if (!hasStartedReading) {
        setHasStartedReading(true);
        startTimeRef.current = Date.now();
        trackBlogReadingStarted(postId, postTitle);
        // Remove the initial scroll listener once reading has begun
        window.removeEventListener("scroll", handleScroll);
      }
    };

    // Track on first scroll
    const handleScroll = () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(handleStartReading, 1000); // Wait 1 second after scroll stops
    };

    // Track on first interaction (click, keypress, etc.)
    const handleInteraction = () => {
      handleStartReading();
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("click", handleInteraction, { once: true });
    window.addEventListener("keydown", handleInteraction, { once: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("click", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [hasStartedReading, postId, postTitle]);

  // Track when user reaches the end of the content
  useEffect(() => {
    if (!hasStartedReading || hasCompletedReading) return;

    const handleScroll = () => {
      if (!contentRef?.current) return;

      const element = contentRef.current;
      const rect = element.getBoundingClientRect();
      const windowHeight = window.innerHeight;

      // Consider "completed" when the bottom of the content is visible
      const isAtBottom = rect.bottom <= windowHeight + 100; // 100px buffer

      if (isAtBottom && !hasCompletedReading) {
        setHasCompletedReading(true);
        const timeSpent = startTimeRef.current
          ? Math.round((Date.now() - startTimeRef.current) / 1000)
          : undefined;
        trackBlogReadingCompleted(postId, postTitle, timeSpent);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    // If reading has started, remove the first listener to reduce duplicate work
    // This ensures we don't keep both listeners alive unnecessarily
    // The cleanup above already removes the initial listener when this effect runs

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [hasStartedReading, hasCompletedReading, postId, postTitle, contentRef]);

  return {
    hasStartedReading,
    hasCompletedReading,
  };
};
