"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Cancel01Icon } from "hugeicons-react";

import { acquireBodyScrollLock, releaseBodyScrollLock } from "@/app/components/AnimatedComponents";
import { classNames } from "@/app/utils";

import { DrawerPoweredByFooter } from "./DrawerPoweredByFooter";
import { DRAWER_SURFACE } from "./drawerStyles";
import { useDrawerEscape, useDrawerFocusTrap } from "./hooks";
import type { ActionDrawerTitle } from "./types";

/** Above Navbar (`z-50`) and nav menus (`z-[60]`), below centred modals (`z-[70]`). */
const DRAWER_PANEL_Z = "z-[68]";

export type ActionDrawerProps = {
  isOpen: boolean;
  title: ActionDrawerTitle;
  onRequestClose: () => void;
  children: ReactNode;
  /** @deprecated Use in-body content; powered-by renders inside the body stack by default. */
  footer?: ReactNode;
  bodyClassName?: string;
  bodyAlign?: "center" | "start";
  showPoweredByFooter?: boolean;
};

export function ActionDrawer({
  isOpen,
  title,
  onRequestClose,
  children,
  footer,
  bodyClassName,
  bodyAlign = "center",
  showPoweredByFooter = true,
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
        <motion.aside
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={classNames(
            "fixed flex flex-col outline-none",
            "top-[58px] right-[10px] bottom-[10px] w-[379px] max-w-[calc(100vw-20px)]",
            "rounded-tr-xl rounded-br-xl border-l border-white/10 bg-[#2b2b2b]",
            DRAWER_PANEL_Z,
          )}
          style={{ backgroundColor: DRAWER_SURFACE }}
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
        >
          <header className="shrink-0 px-[18px] pt-3">
            <div className="flex items-center justify-between">
              <h2
                id={titleId}
                className="font-semibold text-lg leading-9 tracking-[-0.54px] text-white/80"
              >
                {title}
              </h2>
              <button
                type="button"
                aria-label="Close"
                className="text-white/50 transition-colors hover:text-white outline-none focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-lavender-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#2b2b2b]"
                onClick={onRequestClose}
              >
                <Cancel01Icon className="size-5" />
              </button>
            </div>
          </header>
          <hr className="mx-0 mt-4 border-white/10" />
          <div
            className={classNames(
              "flex min-h-0 flex-1 flex-col overflow-y-auto px-[18px] pt-4",
              bodyAlign === "center" ? "justify-center" : "justify-start",
            )}
          >
            <div
              className={classNames(
                "flex w-full flex-col",
                bodyAlign === "center" ? "items-center" : "items-stretch",
                bodyClassName,
              )}
            >
              {children}
              {showPoweredByFooter ? (
                <DrawerPoweredByFooter className="mt-4" />
              ) : null}
            </div>
          </div>
          {footer ? (
            <footer className="mt-4 shrink-0 px-[18px] pb-2">{footer}</footer>
          ) : null}
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );

  if (!portalReady) {
    return null;
  }

  return createPortal(overlay, document.body);
}
