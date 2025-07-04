"use client";
import { AnimatePresence, motion } from "framer-motion";
import { dropdownVariants } from "./AnimatedComponents";
import { useEffect, useRef, useState, ReactNode } from "react";
import { SquareLock02Icon, Tick02Icon, Cancel01Icon } from "hugeicons-react";
import FlagImage from "./FlagImage";
import ReactDOM from "react-dom";
import { classNames } from "../utils";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  DialogBackdrop,
} from "@headlessui/react";

// FlexibleDropdown uses a portal (ReactDOM.createPortal) to render the dropdown menu at the document body level.
// This is necessary to avoid z-index and stacking context issues, ensuring the dropdown always appears above overlays and fixed elements.
// The dropdown is positioned and sized via inline styles for robust alignment.

export interface DropdownItem {
  name: string;
  label?: string;
  imageUrl?: string;
  disabled?: boolean;
}

interface FlexibleDropdownProps {
  data: DropdownItem[];
  defaultSelectedItem?: string;
  selectedItem?: string;
  onSelect?: (name: string) => void;
  children: (props: {
    selectedItem: DropdownItem | undefined;
    isOpen: boolean;
    toggleDropdown: () => void;
  }) => ReactNode;
  className?: string;
  mobileTitle?: string;
  dropdownWidth?: number;
}

export const FlexibleDropdown = ({
  data,
  defaultSelectedItem,
  selectedItem: controlledSelectedItem,
  onSelect,
  children,
  className = "",
  mobileTitle = "Select option",
  dropdownWidth,
}: FlexibleDropdownProps) => {
  const [selectedItem, setSelectedItem] = useState<DropdownItem | undefined>(
    defaultSelectedItem
      ? data.find((item) => item.name === defaultSelectedItem)
      : undefined,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownStyles, setDropdownStyles] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Mobile detection
  const isMobile = () =>
    typeof window !== "undefined" ? window.innerWidth <= 640 : false;

  useEffect(() => {
    if (controlledSelectedItem) {
      const newSelectedItem = data.find(
        (item) => item.name === controlledSelectedItem,
      );
      newSelectedItem && setSelectedItem(newSelectedItem);
    } else if (defaultSelectedItem) {
      const newSelectedItem = data.find(
        (item) => item.name === defaultSelectedItem,
      );
      newSelectedItem && setSelectedItem(newSelectedItem);
    } else {
      setSelectedItem(undefined);
    }
  }, [controlledSelectedItem, defaultSelectedItem, data]);

  const handleChange = (item: DropdownItem) => {
    setSelectedItem(item);
    onSelect && onSelect(item.name);
    setIsOpen(false);
  };

  // Position dropdown on open (right-align with button)
  useEffect(() => {
    function updateDropdownPosition() {
      if (isOpen && buttonRef.current && dropdownRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        const width = dropdownWidth ? dropdownWidth : rect.width;
        const dropdownHeight = dropdownRef.current.offsetHeight;
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        let top = rect.bottom + window.scrollY;
        // If not enough space below, show above
        if (spaceBelow < dropdownHeight && spaceAbove > dropdownHeight) {
          top = rect.top + window.scrollY - dropdownHeight;
        }
        setDropdownStyles({
          position: "absolute",
          top: top,
          left: rect.right - width + window.scrollX, // always right-align
          width: width,
          minWidth: dropdownWidth ? dropdownWidth : 160,
          zIndex: 60,
        });
      }
    }
    if (isOpen) {
      updateDropdownPosition();
      window.addEventListener("resize", updateDropdownPosition);
      window.addEventListener("scroll", updateDropdownPosition, true);
    }
    return () => {
      window.removeEventListener("resize", updateDropdownPosition);
      window.removeEventListener("scroll", updateDropdownPosition, true);
    };
  }, [isOpen, dropdownWidth]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        isOpen &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Option rendering (shared)
  const renderOption = (
    item: DropdownItem,
    handle: (item: DropdownItem) => void,
  ) => (
    <button
      key={item.name}
      type="button"
      disabled={item.disabled}
      onClick={() => !item.disabled && handle(item)}
      className={classNames(
        "flex w-full items-center justify-between gap-2 rounded-lg p-2.5 text-left transition-all duration-300 hover:bg-accent-gray dark:hover:bg-neutral-700",
        item.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        selectedItem?.name === item.name && !item.disabled
          ? "bg-accent-gray dark:bg-neutral-700"
          : "",
      )}
    >
      <div className="flex items-center gap-3 sm:gap-2">
        {item && (
          <FlagImage imageErrors={{}} setImageErrors={() => {}} item={item} />
        )}
        <span className="text-text-body dark:text-white/80">
          {item.label ?? item.name}
        </span>
      </div>
      <div className="ml-2 flex min-w-[24px] flex-shrink-0 items-center justify-end">
        {item.disabled ? (
          <SquareLock02Icon className="size-5 text-icon-outline-secondary dark:text-white/50" />
        ) : selectedItem?.name === item.name ? (
          <Tick02Icon className="size-5 text-gray-400 dark:text-white/50" />
        ) : null}
      </div>
    </button>
  );

  // Mobile modal
  const mobileMenu = (
    <Dialog
      static
      open={isOpen}
      onClose={() => setIsOpen(false)}
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
        <DialogPanel className="w-full space-y-4 rounded-t-[30px] border border-border-light bg-white px-5 py-6 dark:border-white/5 dark:bg-surface-overlay">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-center text-lg font-semibold text-text-body dark:text-white">
              {mobileTitle}
            </DialogTitle>
            <button
              title="Close dropdown"
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10"
            >
              <Cancel01Icon className="size-5 text-outline-gray dark:text-white/50" />
            </button>
          </div>
          <div className="max-h-[50vh] space-y-1 overflow-y-auto">
            {data.map((item) =>
              renderOption(item, (item) => {
                setSelectedItem(item);
                onSelect && onSelect(item.name);
                setIsOpen(false);
              }),
            )}
          </div>
        </DialogPanel>
      </motion.div>
    </Dialog>
  );

  // Desktop dropdown menu content (portal)
  const dropdownMenu = (
    <AnimatePresence>
      <motion.div
        ref={dropdownRef}
        style={dropdownStyles}
        initial="closed"
        animate="open"
        exit="closed"
        variants={dropdownVariants}
        aria-label="Dropdown menu"
        className={classNames(
          "mt-2 max-h-60 space-y-0.5 overflow-y-auto rounded-xl border border-border-light bg-white p-2 shadow-xl focus:outline-none dark:border-white/10 dark:bg-neutral-800",
          className,
        )}
      >
        {data.map((item) => renderOption(item, handleChange))}
      </motion.div>
    </AnimatePresence>
  );

  return (
    <div className="relative">
      <div ref={buttonRef}>
        {children({
          selectedItem,
          isOpen,
          toggleDropdown: () => setIsOpen((v) => !v),
        })}
      </div>
      {isOpen &&
        typeof window !== "undefined" &&
        (isMobile()
          ? ReactDOM.createPortal(mobileMenu, document.body)
          : ReactDOM.createPortal(dropdownMenu, document.body))}
    </div>
  );
};
