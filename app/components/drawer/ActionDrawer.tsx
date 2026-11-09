"use client";

import { useEffect, useId, useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Cancel01Icon } from "hugeicons-react";

import {
  acquireBodyScrollLock,
  releaseBodyScrollLock,
} from "@/app/components/AnimatedComponents";
import { classNames } from "@/app/utils";

import { DrawerPoweredByFooter } from "./DrawerPoweredByFooter";
import {
  drawerCloseButtonClasses,
  drawerDividerClasses,
  drawerHeaderTitleClasses,
  drawerShellClasses,
} from "./drawerStyles";
import {
  useDrawerEscape,
  useDrawerFocusTrap,
  useDrawerOpenFocus,
} from "./hooks";
import type { ActionDrawerTitle } from "./types";
import {
  ACTION_DRAWER_PANEL_ATTR,
  DRAWER_COLUMN_WIDTH_PX,
  WALLET_DRAWER_SLOT_ID,
} from "./walletDrawerSlot";

export type ActionDrawerProps = {
  isOpen: boolean;
  title: ActionDrawerTitle;
  subtitle?: string;
  onRequestClose: () => void;
  children: ReactNode;
  bodyClassName?: string;
  bodyAlign?: "center" | "start";
  showPoweredByFooter?: boolean;
};

function DrawerPanel({
  setPanelNode,
  titleId,
  title,
  subtitle,
  onRequestClose,
  bodyAlign,
  bodyClassName,
  showPoweredByFooter,
  children,
  isModalSheet,
  className,
}: {
  setPanelNode: (node: HTMLElement | null) => void;
  titleId: string;
  title: ActionDrawerTitle;
  subtitle?: string;
  onRequestClose: () => void;
  bodyAlign: "center" | "start";
  bodyClassName?: string;
  showPoweredByFooter: boolean;
  children: ReactNode;
  isModalSheet: boolean;
  className?: string;
}) {
  const subtitleId = subtitle ? `${titleId}-subtitle` : undefined;
  return (
    <aside
      ref={setPanelNode}
      role="dialog"
      aria-modal={isModalSheet ? "true" : "false"}
      aria-labelledby={titleId}
      aria-describedby={subtitleId}
      {...{ [ACTION_DRAWER_PANEL_ATTR]: "" }}
      className={classNames(
        "flex w-[379px] max-w-full shrink-0 flex-col outline-none",
        isModalSheet ? "h-full" : "h-full max-h-full",
        drawerShellClasses,
        className,
      )}
    >
      <header className="shrink-0 px-[18px] pt-3">
        <div
          className={classNames(
            "flex justify-between gap-3",
            subtitle ? "items-start" : "items-center",
          )}
        >
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 id={titleId} className={drawerHeaderTitleClasses}>
              {title}
            </h2>
            {subtitle ? (
              <p
                id={subtitleId}
                className="text-sm font-medium leading-5 tracking-[-0.14px] text-text-secondary dark:text-white/50"
              >
                {subtitle}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Close"
            className={classNames(
              drawerCloseButtonClasses,
              subtitle && "mt-2",
            )}
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

type DrawerPlacement = {
  target: HTMLElement;
  docked: boolean;
};

function resolveDocked() {
  const slot = document.getElementById(WALLET_DRAWER_SLOT_ID);
  const wide = window.matchMedia("(min-width: 768px)").matches;
  return {
    slot,
    docked: Boolean(wide && slot),
  };
}

function resolvePortalTarget(docked: boolean, slot: HTMLElement | null) {
  if (!docked) {
    return document.body;
  }
  return slot ?? document.body;
}

function buildPlacement(): DrawerPlacement {
  const { slot, docked } = resolveDocked();
  return {
    target: resolvePortalTarget(docked, slot),
    docked,
  };
}

export function ActionDrawer({
  isOpen,
  title,
  subtitle,
  onRequestClose,
  children,
  bodyClassName,
  bodyAlign = "center",
  showPoweredByFooter = true,
}: ActionDrawerProps) {
  const [panelNode, setPanelNode] = useState<HTMLElement | null>(null);
  const titleId = useId();
  const [portalReady, setPortalReady] = useState(false);
  const [placement, setPlacement] = useState<DrawerPlacement | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useLayoutEffect(() => {
    if (!portalReady) {
      return;
    }

    if (!isOpen) {
      setPlacement(null);
      setPanelNode(null);
      return;
    }

    setPlacement((prev) => {
      const next = buildPlacement();
      if (prev && prev.target === next.target && prev.docked === next.docked) {
        return prev;
      }
      return next;
    });
  }, [portalReady, isOpen]);

  useEffect(() => {
    if (!portalReady || !isOpen) {
      return;
    }

    const onResize = () => {
      setPlacement((prev) => {
        if (!prev) {
          return prev;
        }
        const next = buildPlacement();
        if (prev.target === next.target && prev.docked === next.docked) {
          return prev;
        }
        return next;
      });
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [portalReady, isOpen]);

  const dockedInShell = placement?.docked ?? false;
  const isModalSheet = Boolean(isOpen && !dockedInShell);
  const hooksActive = isOpen && portalReady && Boolean(panelNode);

  useDrawerOpenFocus(panelNode, hooksActive);
  useDrawerFocusTrap(panelNode, hooksActive && isModalSheet);
  useDrawerEscape(panelNode, onRequestClose, hooksActive);

  useEffect(() => {
    if (!isModalSheet) {
      return;
    }
    acquireBodyScrollLock();
    return () => {
      releaseBodyScrollLock();
    };
  }, [isModalSheet]);

  const widthTransition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 320, damping: 32 };

  const slideTransition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 320, damping: 32 };

  if (!portalReady || !placement) {
    return null;
  }

  const panel = (
    <DrawerPanel
      setPanelNode={setPanelNode}
      titleId={titleId}
      title={title}
      subtitle={subtitle}
      onRequestClose={onRequestClose}
      bodyAlign={bodyAlign}
      bodyClassName={bodyClassName}
      showPoweredByFooter={showPoweredByFooter}
      isModalSheet={isModalSheet}
      className={isModalSheet ? "shadow-2xl" : undefined}
    >
      {children}
    </DrawerPanel>
  );

  const overlay = (
    <>
      {isModalSheet && isOpen ? (
        <button
          type="button"
          aria-label="Close drawer"
          className="fixed inset-0 z-[67] bg-black/50"
          onClick={onRequestClose}
        />
      ) : null}
      <motion.div
        className={classNames(
          dockedInShell
            ? "flex h-full max-h-full shrink-0 overflow-hidden"
            : "fixed inset-y-0 right-0 z-[68] flex max-w-[379px] w-full",
        )}
        initial={false}
        animate={
          dockedInShell
            ? { width: isOpen ? DRAWER_COLUMN_WIDTH_PX : 0, opacity: 1 }
            : isOpen
              ? { x: 0, opacity: 1 }
              : { x: reduceMotion ? 0 : "100%", opacity: reduceMotion ? 0 : 1 }
        }
        transition={dockedInShell ? widthTransition : slideTransition}
        aria-hidden={!isOpen}
      >
        {isOpen ? panel : null}
      </motion.div>
    </>
  );

  return createPortal(overlay, placement.target);
}
