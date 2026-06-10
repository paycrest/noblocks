"use client";
import { AnimatePresence, motion } from "framer-motion";
import { dropdownVariants } from "./AnimatedComponents";
import { useEffect, useMemo, useRef, useState, ReactNode } from "react";
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
    disabled: boolean;
  }) => ReactNode;
  className?: string;
  mobileTitle?: string;
  dropdownWidth?: number;
  /** When true, toggling the menu is blocked (e.g. Starknet on-ramp placeholders). */
  disabled?: boolean;
  /**
   * When the menu is open, letter/number keys jump the list to the first option
   * whose label (or name) starts with the typed prefix (multi-key within ~500ms).
   */
  enableKeyboardSearch?: boolean;
  /** When true, shows a search field and filters options by label/name (substring match). */
  searchable?: boolean;
  /** Placeholder for the search input when `searchable` is true. */
  searchPlaceholder?: string;
}

function resolveDefaultSelection(
  defaultSelectedItem: string | undefined,
  data: DropdownItem[],
): DropdownItem | undefined {
  const key = defaultSelectedItem?.trim();
  if (!key) return undefined;
  return data.find((item) => item.name === key);
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
  disabled = false,
  enableKeyboardSearch = true,
  searchable = false,
  searchPlaceholder = "Search…",
}: FlexibleDropdownProps) => {
  const [selectedItem, setSelectedItem] = useState<DropdownItem | undefined>(() =>
    resolveDefaultSelection(defaultSelectedItem, data),
  );
  const [isOpen, setIsOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const [dropdownStyles, setDropdownStyles] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  /** Scroll container for options (desktop portal or mobile sheet) — used for type-ahead scroll. */
  const optionsListRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const typeAheadBufferRef = useRef("");
  const typeAheadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredData = useMemo(() => {
    if (!searchable) return data;
    const q = filterQuery.trim().toLowerCase();
    if (!q) return data;
    return data.filter((item) => {
      const label = (item.label ?? item.name).toLowerCase();
      const name = item.name.toLowerCase();
      return label.includes(q) || name.includes(q);
    });
  }, [data, filterQuery, searchable]);

  useEffect(() => {
    if (!isOpen) {
      setFilterQuery("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !searchable) return;
    const id = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [isOpen, searchable]);

  // Mobile detection
  const isMobile = () =>
    typeof window !== "undefined" ? window.innerWidth <= 640 : false;

  useEffect(() => {
    const controlledKey = controlledSelectedItem?.trim();
    if (controlledKey) {
      const newSelectedItem = data.find(
        (item) => item.name === controlledKey,
      );
      newSelectedItem && setSelectedItem(newSelectedItem);
    } else {
      setSelectedItem(resolveDefaultSelection(defaultSelectedItem, data));
    }
  }, [controlledSelectedItem, defaultSelectedItem, data]);

  const handleChange = (item: DropdownItem) => {
    setSelectedItem(item);
    onSelect && onSelect(item.name);
    setIsOpen(false);
  };

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
    if (!isOpen) {
      return;
    }

    updateDropdownPosition();
    const rafId = window.requestAnimationFrame(() => {
      updateDropdownPosition();
    });

    window.addEventListener("resize", updateDropdownPosition);
    window.addEventListener("scroll", updateDropdownPosition, true);

    const el = dropdownRef.current;
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && el) {
      resizeObserver = new ResizeObserver(() => {
        updateDropdownPosition();
      });
      resizeObserver.observe(el);
    }

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updateDropdownPosition);
      window.removeEventListener("scroll", updateDropdownPosition, true);
      resizeObserver?.disconnect();
    };
  }, [isOpen, dropdownWidth]);

  useEffect(() => {
    if (disabled && isOpen) {
      setIsOpen(false);
    }
  }, [disabled, isOpen]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        isOpen &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
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

  useEffect(() => {
    if (!isOpen || !enableKeyboardSearch || filteredData.length === 0) {
      typeAheadBufferRef.current = "";
      if (typeAheadTimerRef.current) {
        clearTimeout(typeAheadTimerRef.current);
        typeAheadTimerRef.current = null;
      }
      return;
    }

    const TYPE_AHEAD_IDLE_MS = 550;

    const clearTypeAheadTimer = () => {
      if (typeAheadTimerRef.current) {
        clearTimeout(typeAheadTimerRef.current);
        typeAheadTimerRef.current = null;
      }
    };

    const resetBufferSoon = () => {
      clearTypeAheadTimer();
      typeAheadTimerRef.current = setTimeout(() => {
        typeAheadBufferRef.current = "";
        typeAheadTimerRef.current = null;
      }, TYPE_AHEAD_IDLE_MS);
    };

    const labelText = (item: DropdownItem) =>
      (item.label ?? item.name).trim().toLowerCase();

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      if (
        target instanceof Node &&
        (target as HTMLElement).closest?.(
          "input, textarea, select, [contenteditable=true]",
        )
      ) {
        return;
      }

      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "Escape") {
        typeAheadBufferRef.current = "";
        clearTypeAheadTimer();
        return;
      }

      if (e.key.length !== 1) return;

      const ch = e.key;
      if (!/[a-zA-Z0-9]/.test(ch)) return;

      e.preventDefault();
      typeAheadBufferRef.current += ch.toLowerCase();
      resetBufferSoon();

      const prefix = typeAheadBufferRef.current;
      const match = filteredData.find(
        (item) => !item.disabled && labelText(item).startsWith(prefix),
      );
      if (!match) return;

      const root = optionsListRef.current;
      if (!root) return;

      const escaped = CSS.escape(match.name);
      const optionEl = root.querySelector<HTMLElement>(
        `[data-dropdown-option="${escaped}"]`,
      );
      optionEl?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      clearTypeAheadTimer();
      typeAheadBufferRef.current = "";
    };
  }, [isOpen, enableKeyboardSearch, filteredData]);

  // Option rendering (shared)
  const renderOption = (
    item: DropdownItem,
    handle: (item: DropdownItem) => void,
  ) => (
    <button
      key={item.name}
      type="button"
      role="option"
      aria-selected={selectedItem?.name === item.name}
      data-dropdown-option={item.name}
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
          {searchable ? (
            <input
              ref={searchInputRef}
              type="search"
              role="searchbox"
              aria-label={searchPlaceholder}
              placeholder={searchPlaceholder}
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              className="w-full rounded-xl border border-border-input bg-transparent px-3 py-2.5 text-sm text-text-body placeholder:text-text-placeholder focus:border-lavender-500 focus:outline-none focus:ring-1 focus:ring-lavender-500 dark:border-white/20 dark:text-white/90 dark:placeholder:text-white/40"
            />
          ) : null}
          <div
            ref={(node) => {
              optionsListRef.current = node;
            }}
            role="listbox"
            aria-label={mobileTitle}
            className="max-h-[50vh] space-y-1 overflow-y-auto"
          >
            {filteredData.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-text-secondary dark:text-white/50">
                No matching options
              </p>
            ) : (
              filteredData.map((item) =>
                renderOption(item, (item) => {
                  setSelectedItem(item);
                  onSelect && onSelect(item.name);
                  setIsOpen(false);
                }),
              )
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
        ref={(node) => {
          dropdownRef.current = node;
        }}
        style={dropdownStyles}
        initial="closed"
        animate="open"
        exit="closed"
        variants={dropdownVariants}
        className={classNames(
          "mt-2 flex max-h-60 flex-col overflow-hidden rounded-xl border border-border-light bg-white shadow-xl focus:outline-none dark:border-white/10 dark:bg-neutral-800",
          className,
        )}
      >
        {searchable ? (
          <div className="shrink-0 border-b border-border-light bg-white p-2 dark:border-white/10 dark:bg-neutral-800">
            <input
              ref={searchInputRef}
              type="search"
              role="searchbox"
              aria-label={searchPlaceholder}
              placeholder={searchPlaceholder}
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              className="w-full rounded-lg border border-border-input bg-transparent px-3 py-2 text-sm text-text-body placeholder:text-text-placeholder focus:border-lavender-500 focus:outline-none focus:ring-1 focus:ring-lavender-500 dark:border-white/20 dark:text-white/90 dark:placeholder:text-white/40"
            />
          </div>
        ) : null}
        <div
          ref={(node) => {
            optionsListRef.current = node;
          }}
          role="listbox"
          aria-label="Dropdown menu"
          className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2"
        >
          {filteredData.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-text-secondary dark:text-white/50">
              No matching options
            </p>
          ) : (
            filteredData.map((item) => renderOption(item, handleChange))
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );

  return (
    <div className="relative">
      <div ref={buttonRef}>
        {children({
          selectedItem,
          isOpen,
          disabled,
          toggleDropdown: () => {
            if (disabled) return;
            setIsOpen((v) => !v);
          },
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
