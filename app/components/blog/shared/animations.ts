import { easeOut } from "framer-motion";

// Reusable Framer Motion animation variants for blog UI

export const fadeBlur = {
  initial: { opacity: 0, filter: "blur(12px)" },
  animate: { opacity: 1, filter: "blur(0px)" },
  exit: { opacity: 0, filter: "blur(12px)" },
  transition: { duration: 0.6, ease: easeOut },
};

export const fadeBlurFast = {
  initial: { opacity: 0, filter: "blur(8px)" },
  animate: { opacity: 1, filter: "blur(0px)" },
  exit: { opacity: 0, filter: "blur(8px)" },
  transition: { duration: 0.5, ease: easeOut },
};

export const fadeSlideUp = {
  initial: { opacity: 0, y: 24, filter: "blur(8px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: 24, filter: "blur(8px)" },
  transition: { duration: 0.5, ease: easeOut },
};
