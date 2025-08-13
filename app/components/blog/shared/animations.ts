import { easeOut } from "framer-motion";

// Check for reduced motion preference
const prefersReducedMotion =
  typeof window !== "undefined"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

// Reusable Framer Motion animation variants for blog UI

export const fadeBlur = {
  initial: {
    opacity: 0,
    filter: prefersReducedMotion ? "blur(0px)" : "blur(12px)",
  },
  animate: { opacity: 1, filter: "blur(0px)" },
  exit: {
    opacity: 0,
    filter: prefersReducedMotion ? "blur(0px)" : "blur(12px)",
  },
  transition: {
    duration: prefersReducedMotion ? 0.1 : 0.6,
    ease: easeOut,
  },
};

export const fadeBlurFast = {
  initial: {
    opacity: 0,
    filter: prefersReducedMotion ? "blur(0px)" : "blur(8px)",
  },
  animate: { opacity: 1, filter: "blur(0px)" },
  exit: {
    opacity: 0,
    filter: prefersReducedMotion ? "blur(0px)" : "blur(8px)",
  },
  transition: { duration: prefersReducedMotion ? 0.1 : 0.5, ease: easeOut },
};

export const fadeSlideUp = {
  initial: {
    opacity: 0,
    y: prefersReducedMotion ? 0 : 24,
    filter: prefersReducedMotion ? "blur(0px)" : "blur(8px)",
  },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: {
    opacity: 0,
    y: prefersReducedMotion ? 0 : 24,
    filter: prefersReducedMotion ? "blur(0px)" : "blur(8px)",
  },
  transition: { duration: prefersReducedMotion ? 0.1 : 0.5, ease: easeOut },
};
