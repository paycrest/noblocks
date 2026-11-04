"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Cancel01Icon } from "hugeicons-react";

import { classNames } from "@/app/utils";

import { DrawerPoweredByFooter } from "./DrawerPoweredByFooter";
import {
  drawerCloseButtonClasses,
  drawerDividerClasses,
  drawerHeaderTitleClasses,
  drawerShellClasses,
} from "./drawerStyles";
import { useDrawerEscape, useDrawerOpenFocus } from "./hooks";
import type { ActionDrawerTitle } from "./types";
import {
  DRAWER_COLUMN_WIDTH_PX,
  WALLET_DRAWER_SLOT_ID,
} from "./walletDrawerSlot";

export type ActionDrawerProps = {
  isOpen: boolean;
  title: ActionDrawerTitle;
  onRequestClose: () => void;
  children: ReactNode;
  bodyClassName?: string;
  bodyAlign?: "center" | "start";
  showPoweredByFooter?: boolean;
};

function DrawerPanel({
  panelRef,
  setPanelNode,
  titleId,
  title,
  onRequestClose,
  bodyAlign,
  bodyClassName,
  showPoweredByFooter,
  children,
  className,
}: {
  panelRef: React.RefObject<HTMLElement | null>;
  setPanelNode: (node: HTMLElement | null) => void;
  titleId: string;
  title: ActionDrawerTitle;
  onRequestClose: () => void;
  bodyAlign: "center" | "start";
  bodyClassName?: string;
  showPoweredByFooter: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <aside
      ref={(node) => {
        panelRef.current = node;
        setPanelNode(node);
      }}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className={classNames(
        "flex h-full w-[379px] max-w-full shrink-0 flex-col outline-none",
        drawerShellClasses,
        className,
      )}
    >
      <header className="shrink-0 px-[18px] pt-3">
        <div className="flex items-center justify-between">
          <h2 id={titleId} className={drawerHeaderTitleClasses}>
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            className={drawerCloseButtonClasses}
            onClick={onRequestClose}
          >
            <Cancel01Icon className="size-5" aria-hidden />
          </button>
        </div>
      </header>
      <hr className={classNames("mx-0 mt-4", drawerDividerClasses)} />
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
    </aside>
  );
}

export function ActionDrawer({
  isOpen,
  title,
  onRequestClose,
  children,
  bodyClassName,
  bodyAlign = "center",
  showPoweredByFooter = true,
}: ActionDrawerProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const [panelNode, setPanelNode] = useState<HTMLElement | null>(null);
  const titleId = useId();
  const [portalReady, setPortalReady] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [dockedInShell, setDockedInShell] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!portalReady) {
      return;
    }

    const syncPlacement = () => {
      const slot = document.getElementById(WALLET_DRAWER_SLOT_ID);
      const wide = window.matchMedia("(min-width: 768px)").matches;
      const docked = Boolean(wide && slot);
      setDockedInShell(docked);
      setPortalTarget(docked && slot ? slot : document.body);
    };

    syncPlacement();
    window.addEventListener("resize", syncPlacement);
    return () => window.removeEventListener("resize", syncPlacement);
  }, [portalReady]);

  const panelRefForHooks = useRef<HTMLElement | null>(null);
  panelRefForHooks.current = panelNode;

  useDrawerOpenFocus(panelNode, isOpen && portalReady && Boolean(panelNode));
  useDrawerEscape(panelNode, onRequestClose, isOpen && portalReady && Boolean(panelNode));

  const widthTransition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 320, damping: 32 };

  const slideTransition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 320, damping: 32 };

  const panelProps = {
    panelRef,
    setPanelNode,
    titleId,
    title,
    onRequestClose,
    bodyAlign,
    bodyClassName,
    showPoweredByFooter,
    children,
  };

  let overlay: ReactNode = null;

  if (dockedInShell) {
    overlay = (
      <motion.div
        className="flex h-full shrink-0 overflow-hidden"
        initial={false}
        animate={{ width: isOpen ? DRAWER_COLUMN_WIDTH_PX : 0 }}
        transition={widthTransition}
        aria-hidden={!isOpen}
      >
        <AnimatePresence initial={false}>
          {isOpen ? (
            <motion.div
              className="h-full shrink-0"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.15 }}
            >
              <DrawerPanel {...panelProps} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    );
  } else {
    overlay = (
      <AnimatePresence>
        {isOpen ? (
          <motion.div
            className="fixed inset-y-0 right-0 z-[68] flex max-w-[379px] w-full"
            initial={reduceMotion ? false : { x: "100%" }}
            animate={{ x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { x: "100%" }}
            transition={slideTransition}
          >
            <DrawerPanel {...panelProps} className="shadow-2xl md:shadow-none" />
          </motion.div>
        ) : null}
      </AnimatePresence>
    );
  }

  if (!portalReady || !portalTarget) {
    return null;
  }

  return createPortal(overlay, portalTarget);
}
