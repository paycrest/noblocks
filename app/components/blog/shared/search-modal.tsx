"use client";

import { RefObject, useEffect, useId, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search01Icon } from "hugeicons-react";
import { fadeSlideUp } from "./animations";
import { trackSearch } from "@/app/hooks/analytics/useMixpanel";

export interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  search: string;
  setSearch: (v: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  showSuggestions: boolean;
  setShowSuggestions: (v: boolean) => void;
  filteredSuggestions: { id: string; title: string }[];
  setIsModalOpen: (v: boolean) => void;
  overlayClass?: string;
  inputAutoFocus?: boolean;
  handleSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSuggestionClick?: (suggestion: { id: string; title: string }) => void;
}

export function SearchModal({
  isOpen,
  onClose,
  search,
  setSearch,
  searchInputRef,
  showSuggestions,
  setShowSuggestions,
  filteredSuggestions,
  setIsModalOpen,
  overlayClass = "",
  inputAutoFocus = false,
  handleSearchKeyDown,
  onSuggestionClick,
}: SearchModalProps) {
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  // Generate unique IDs for ARIA
  const suggestionsId = `search-suggestions-${useId()}`;

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        globalThis.clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  // Reset active index when suggestions change
  useEffect(() => {
    setActiveIndex(-1);
  }, [filteredSuggestions]);

  const handleSuggestionClick = (suggestion: { id: string; title: string }) => {
    setSearch(suggestion.title);
    setShowSuggestions(false);
    setIsModalOpen(false);
    setActiveIndex(-1);
    // Track the search
    trackSearch(suggestion.title, 1, { source: "suggestion_click" });
    // Call the callback to update URL parameters
    onSuggestionClick?.(suggestion);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && filteredSuggestions.length > 0) {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((prev) =>
            prev < filteredSuggestions.length - 1 ? prev + 1 : 0,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((prev) =>
            prev > 0 ? prev - 1 : filteredSuggestions.length - 1,
          );
          break;
        case "Enter":
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < filteredSuggestions.length) {
            handleSuggestionClick(filteredSuggestions[activeIndex]);
          } else {
            // Call the original handler for non-suggestion selection
            handleSearchKeyDown(e);
          }
          break;
        case "Escape":
          setShowSuggestions(false);
          setActiveIndex(-1);
          break;
        default:
          // Call the original handler for other keys
          handleSearchKeyDown(e);
      }
    } else {
      // Call the original handler when no suggestions are shown
      handleSearchKeyDown(e);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={`fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 py-8 backdrop-blur-md ${overlayClass}`}
          onClick={() => {
            onClose();
            setShowSuggestions(false);
            setActiveIndex(-1);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              onClose();
              setShowSuggestions(false);
              setActiveIndex(-1);
            }
          }}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="relative mx-auto flex w-full max-w-lg flex-col items-stretch rounded-xl border border-gray-200 bg-white py-2 pl-2.5 shadow-2xl dark:border-white/20 dark:bg-surface-canvas"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center">
              <Search01Icon className="h-4 w-4 text-gray-400 dark:text-white/50" />
              <input
                ref={searchInputRef}
                type="search"
                className="w-full flex-1 bg-transparent px-2.5 text-sm font-normal text-text-body placeholder-text-secondary outline-none dark:text-white dark:placeholder-white/30"
                placeholder="Search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setShowSuggestions(true);
                  setActiveIndex(-1);
                }}
                onKeyDown={handleInputKeyDown}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => {
                  if (blurTimeoutRef.current)
                    globalThis.clearTimeout(blurTimeoutRef.current);
                  blurTimeoutRef.current = globalThis.setTimeout(() => {
                    setShowSuggestions(false);
                    setActiveIndex(-1);
                  }, 100);
                }}
                autoFocus={inputAutoFocus}
                role="combobox"
                aria-controls={suggestionsId}
                aria-expanded={
                  showSuggestions && filteredSuggestions.length > 0
                }
                aria-haspopup="listbox"
                aria-autocomplete="list"
                aria-activedescendant={
                  activeIndex >= 0 && activeIndex < filteredSuggestions.length
                    ? `${suggestionsId}-option-${activeIndex}`
                    : undefined
                }
              />
            </div>
            {/* Suggestions Dropdown */}
            <AnimatePresence>
              {showSuggestions && filteredSuggestions.length > 0 && (
                <motion.div
                  {...fadeSlideUp}
                  className="absolute left-0 right-0 top-full z-50 mt-2 max-h-96 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-white/20 dark:bg-surface-canvas"
                >
                  <ul id={suggestionsId} role="listbox" className="w-full">
                    {filteredSuggestions.map((suggestion, index) => (
                      <li
                        key={suggestion.id}
                        id={`${suggestionsId}-option-${index}`}
                        role="option"
                        aria-selected={index === activeIndex}
                        className={`cursor-pointer px-4 py-2 text-sm text-text-body transition hover:bg-gray-100 dark:text-white dark:hover:bg-white/10 ${
                          index === activeIndex
                            ? "bg-gray-100 dark:bg-white/10"
                            : ""
                        }`}
                        onMouseDown={() => handleSuggestionClick(suggestion)}
                        onMouseEnter={() => setActiveIndex(index)}
                      >
                        {suggestion.title}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
