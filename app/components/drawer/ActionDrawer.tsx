"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Cancel01Icon } from "hugeicons-react";

import { acquireBodyScrollLock, releaseBodyScrollLock } from "@/app/components/AnimatedComponents";
import { classNames } from "@/app/utils";

import { useDrawerEscape, useDrawerFocusTrap } from "./hooks";
import type { ActionDrawerTitle } from "./types";

/** Above Navbar (`z-50`) and nav portaled menus (`z-[60]`), below centred modals (`z-[70]`). */
const DRAWER_BACKDROP_Z = "z-[68]";
const DRAWER_PANEL_Z = "z-[68]";

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
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useDrawerFocusTrap(panelRef, isOpen && portalReady);
  useDrawerEscape(panelRef, onRequestClose, isOpen && portalReady);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    acquireBodyScrollLock();
    return () => {
      releaseBodyScrollLock();
    };
  }, [isOpen]);

  const overlay = (
    <AnimatePresence>
      {isOpen ? (
        <>
          <motion.div
            aria-hidden
            className={classNames(
              "fixed inset-0 bg-black/70",
              DRAWER_BACKDROP_Z,
            )}
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
              "fixed inset-y-0 right-0 flex w-full max-w-[379px] flex-col",
              "border-l border-white/10 bg-[#202020] py-3",
              DRAWER_PANEL_Z,
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
                className="rounded-md text-white/50 transition-colors hover:text-white outline-none focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-lavender-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#202020]"
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

  if (!portalReady) {
    return null;
  }

  return createPortal(overlay, document.body);
}
