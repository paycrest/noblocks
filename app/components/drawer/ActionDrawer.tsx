"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Cancel01Icon } from "hugeicons-react";

import { acquireBodyScrollLock, releaseBodyScrollLock } from "@/app/components/AnimatedComponents";
import { classNames } from "@/app/utils";

import { useDrawerEscape, useDrawerFocusTrap } from "./hooks";
import type { ActionDrawerTitle } from "./types";

export type ActionDrawerProps = {
  isOpen: boolean;
  title: ActionDrawerTitle;
  onRequestClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Optional class on the scrollable body region. */
  bodyClassName?: string;
};

export function ActionDrawer({
  isOpen,
  title,
  onRequestClose,
  children,
  footer,
  bodyClassName,
}: ActionDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useDrawerFocusTrap(panelRef, isOpen);
  useDrawerEscape(panelRef, onRequestClose, isOpen);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    acquireBodyScrollLock();
    return () => {
      releaseBodyScrollLock();
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen ? (
        <>
          <motion.button
            type="button"
            aria-label="Close drawer backdrop"
            className="fixed inset-0 z-[60] bg-black/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onRequestClose}
          />
          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={classNames(
              "fixed inset-y-0 right-0 z-[61] flex w-full max-w-[379px] flex-col",
              "border-l border-white/10 bg-white/[0.05] py-3",
            )}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
          >
            <header className="flex shrink-0 items-center justify-between px-[18px]">
              <h2
                id={titleId}
                className="text-lg font-semibold tracking-[-0.54px] text-white"
              >
                {title}
              </h2>
              <button
                type="button"
                aria-label="Close"
                className="rounded-md text-white/50 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500"
                onClick={onRequestClose}
              >
                <Cancel01Icon className="size-5" />
              </button>
            </header>
            <hr className="my-4 border-white/10" />
            <div
              className={classNames(
                "flex flex-1 flex-col justify-center gap-4 overflow-y-auto px-[18px]",
                bodyClassName,
              )}
            >
              {children}
            </div>
            {footer ? (
              <footer className="mt-4 shrink-0 px-[18px] pb-2">{footer}</footer>
            ) : null}
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
