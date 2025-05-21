"use client";
import type { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogPanel } from "@headlessui/react";
import type { AnimatedComponentProps } from "../types";
import { classNames } from "../utils";
import { Cancel01Icon } from "hugeicons-react";

// Animation variants and transition
const pageVariants = {
  initial: { opacity: 0, y: 20 },
  in: { opacity: 1, y: 0 },
  out: { opacity: 0, y: -20 },
};

const pageTransition = {
  type: "tween",
  ease: "anticipate",
  duration: 0.5,
};

export const fadeInOut = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const slideInOut = {
  initial: { ...fadeInOut.initial, y: 20 },
  animate: { ...fadeInOut.animate, y: 0 },
  exit: { ...fadeInOut.exit, y: -20 },
};

export const slideInDown = {
  initial: { ...fadeInOut.initial, y: -20 },
  animate: { ...fadeInOut.animate, y: 0 },
  exit: { ...fadeInOut.exit, y: -20 },
};

export const scaleInOut = {
  initial: { ...fadeInOut.initial, scale: 0 },
  animate: { ...fadeInOut.animate, scale: 1 },
  exit: { ...fadeInOut.exit, scale: 0 },
};

export const fadeInLeft = {
  initial: { ...fadeInOut.initial, x: -20 },
  animate: { ...fadeInOut.animate, x: 0 },
  exit: { ...fadeInOut.exit, x: -20 },
};

export const fadeInRight = {
  initial: { ...fadeInOut.initial, x: 20 },
  animate: { ...fadeInOut.animate, x: 0 },
  exit: { ...fadeInOut.exit, x: 20 },
};

export const slideUpAnimation = {
  initial: { y: "100%", opacity: 0 },
  animate: { y: 0, opacity: 1 },
  exit: { y: "100%", opacity: 0 },
  transition: {
    type: "spring",
    stiffness: 300,
    damping: 30,
    duration: 0.2,
  },
};

export const sidebarAnimation = {
  initial: { x: "100%", opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: "100%", opacity: 0 },
  transition: {
    type: "spring",
    stiffness: 300,
    damping: 30,
    duration: 0.2,
  },
};

export const dropdownVariants = {
  open: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 30,
      duration: 0.3,
    },
  },
  closed: {
    opacity: 0,
    y: 20,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 30,
      duration: 0.3,
    },
  },
};

// Animated wrapper component
export const AnimatedPage: React.FC<{
  children: ReactNode;
  componentKey: string;
}> = ({ children, componentKey }) => (
  <motion.div
    key={componentKey}
    initial="initial"
    animate="in"
    exit="out"
    variants={pageVariants}
    transition={pageTransition}
  >
    {children}
  </motion.div>
);

// Animated component wrapper
export const AnimatedComponent = ({
  children,
  variant = fadeInOut,
  className = "",
  delay = 0,
}: AnimatedComponentProps) => (
  <motion.div
    variants={variant}
    initial="initial"
    animate="animate"
    exit="exit"
    transition={{ duration: 0.3, delay }}
    className={className}
  >
    {children}
  </motion.div>
);

// Animated feedback item wrapper
export const AnimatedFeedbackItem = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <AnimatedComponent
    variant={slideInDown}
    className={`flex flex-1 items-center gap-1 ${className}`}
  >
    {children}
  </AnimatedComponent>
);

type AnimatedModalProps = {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
  dialogPanelClassName?: string;
};

export const AnimatedModal = ({
  isOpen,
  onClose,
  children,
  maxWidth = "27.75rem",
  dialogPanelClassName,
  showGradientHeader = false,
}: AnimatedModalProps & { showGradientHeader?: boolean }) => (
  <AnimatePresence>
    {isOpen && (
      <Dialog open={isOpen} onClose={onClose} className="relative z-50">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 bg-black/30 backdrop-blur-sm"
        />

        <div className="fixed inset-0 flex w-screen items-end sm:items-center sm:justify-center sm:p-4">
          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 30,
            }}
            className="w-full"
          >
            <DialogPanel
              className={classNames(
                "relative mx-auto w-full",
                dialogPanelClassName || "",
              )}
              style={{ maxWidth: window.innerWidth > 640 ? maxWidth : "none" }}
            >
              {showGradientHeader && (
                <div className="h-24 w-full bg-gradient-to-r from-[#7b8c12] via-[#243b81] to-[#1d1324] max-sm:rounded-t-[30px] sm:max-h-[90vh] sm:rounded-3xl">
                  <Cancel01Icon
                    className="absolute right-4 top-4 size-6 cursor-pointer text-white/80"
                    onClick={onClose}
                  />
                </div>
              )}

              <div
                className={classNames(
                  "w-full overflow-y-auto bg-white p-5 text-sm dark:bg-surface-overlay max-sm:rounded-t-[30px] sm:max-h-[90vh] sm:rounded-3xl",
                  showGradientHeader ? "-mt-10" : "",
                )}
              >
                {children}
              </div>
            </DialogPanel>
          </motion.div>
        </div>
      </Dialog>
    )}
  </AnimatePresence>
);
