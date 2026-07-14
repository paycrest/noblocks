"use client";

import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { ArrowDown01Icon, Cancel01Icon } from "hugeicons-react";
import { classNames } from "@/app/utils";
import { dropdownVariants } from "../AnimatedComponents";

export type BridgePickerItem = {
  id: string;
  label: string;
  imgSrc: string;
  sub?: string;
};

type BridgePickerProps = {
  title: string;
  items: BridgePickerItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
  trigger: (props: {
    isOpen: boolean;
    toggle: () => void;
  }) => React.ReactNode;
  /** Desktop menu width in px. */
  menuWidth?: number;
};

function isMobileViewport() {
  return typeof window !== "undefined" ? window.innerWidth <= 640 : false;
}

/**
 * Convert picker: dissolve-underneath dropdown on desktop (both from/to),
 * bottom sheet on mobile — matches the rest of noblocks web/mobile patterns.
 */
export function BridgePicker({
  title,
  items,
  selectedId,
  onSelect,
  trigger,
  menuWidth = 260,
}: BridgePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyles, setMenuStyles] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const toggle = () => setIsOpen((v) => !v);
  const close = () => setIsOpen(false);

  const handleSelect = (id: string) => {
    onSelect(id);
    close();
  };

  useEffect(() => {
    if (!isOpen || isMobileViewport()) return;

    const update = () => {
      if (!buttonRef.current || !menuRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const height = menuRef.current.offsetHeight;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      let top = rect.bottom + window.scrollY + 8;
      if (spaceBelow < height && spaceAbove > height) {
        top = rect.top + window.scrollY - height - 8;
      }
      // Left-align under the clicked control (design: dissolve just underneath).
      let left = rect.left + window.scrollX;
      const maxLeft = window.scrollX + window.innerWidth - menuWidth - 8;
      if (left > maxLeft) left = Math.max(window.scrollX + 8, maxLeft);

      setMenuStyles({
        position: "absolute",
        top,
        left,
        width: menuWidth,
        zIndex: 70,
      });
    };

    update();
    const raf = window.requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [isOpen, menuWidth, items.length]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [isOpen]);

  const list =
    items.length === 0 ? (
      <p className="px-3 py-6 text-center text-sm text-text-secondary dark:text-white/50">
        No options available
      </p>
    ) : (
      items.map((item) => {
        const selected = item.id === selectedId;
        return (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => handleSelect(item.id)}
            className={classNames(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
              selected
                ? "bg-accent-gray dark:bg-white/10"
                : "hover:bg-accent-gray dark:hover:bg-white/5",
            )}
          >
            <img
              src={item.imgSrc}
              alt=""
              className="size-7 shrink-0 rounded-full bg-gray-100 dark:bg-white/10"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text-body dark:text-white">
                {item.label}
              </p>
              {item.sub ? (
                <p className="truncate text-xs text-text-secondary dark:text-white/40">
                  {item.sub}
                </p>
              ) : null}
            </div>
          </button>
        );
      })
    );

  const desktopMenu =
    typeof window !== "undefined" ? (
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={menuRef}
            style={menuStyles}
            initial="closed"
            animate="open"
            exit="closed"
            variants={dropdownVariants}
            className="overflow-hidden rounded-xl bg-white shadow-xl dark:bg-neutral-800"
          >
            <p className=" px-3 py-2.5 text-xs text-text-secondary dark:text-white/40">
              {title}
            </p>
            <div role="listbox" aria-label={title} className="max-h-60 space-y-0.5 overflow-y-auto p-1.5">
              {list}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    ) : null;

  const mobileMenu = (
    <Dialog
      static
      open={isOpen}
      onClose={close}
      className="relative z-[100] sm:hidden"
    >
      <DialogBackdrop className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
      <motion.div
        initial="closed"
        animate="open"
        exit="closed"
        variants={dropdownVariants}
        className="fixed inset-0 flex w-screen items-end justify-center"
      >
        <DialogPanel className="max-h-[75dvh] w-full space-y-3 rounded-t-[30px] border border-border-light bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 dark:border-white/5 dark:bg-surface-overlay">
          <div className="flex justify-center pb-1">
            <div className="h-1 w-10 rounded-full bg-gray-300 dark:bg-white/20" />
          </div>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold text-text-body dark:text-white">
              {title}
            </DialogTitle>
            <button
              type="button"
              title="Close"
              onClick={close}
              className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10"
            >
              <Cancel01Icon className="size-5 text-outline-gray dark:text-white/50" />
            </button>
          </div>
          <div role="listbox" aria-label={title} className="max-h-[50vh] space-y-0.5 overflow-y-auto">
            {list}
          </div>
        </DialogPanel>
      </motion.div>
    </Dialog>
  );

  return (
    <div className="relative">
      <div ref={buttonRef}>{trigger({ isOpen, toggle })}</div>
      {isOpen &&
        typeof window !== "undefined" &&
        (isMobileViewport()
          ? ReactDOM.createPortal(mobileMenu, document.body)
          : ReactDOM.createPortal(desktopMenu, document.body))}
    </div>
  );
}

export function BridgePickerChevron({ isOpen }: { isOpen: boolean }) {
  return (
    <ArrowDown01Icon
      strokeWidth={1.5}
      className={classNames(
        "size-5 shrink-0 text-gray-400 transition-transform dark:text-white/40",
        isOpen ? "rotate-180" : "",
      )}
    />
  );
}
