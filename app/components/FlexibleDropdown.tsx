"use client";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { useOutsideClick } from "../hooks";
import { dropdownVariants } from "./AnimatedComponents";
import { useEffect, useRef, useState, ReactNode } from "react";
import { Cancel01Icon, SquareLock02Icon, Tick02Icon } from "hugeicons-react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  DialogBackdrop,
} from "@headlessui/react";

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
}

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

const DropdownContent = ({
  data,
  selectedItem,
  handleChange,
}: {
  data: DropdownItem[];
  selectedItem?: DropdownItem;
  handleChange: (item: DropdownItem) => void;
}) => (
  <ul
    aria-label="Dropdown items"
    aria-labelledby="dropdown-items"
    className="px-2 font-normal max-sm:space-y-1"
  >
    {data?.map((item) => (
      <li
        key={item.name}
        onClick={() => !item.disabled && handleChange(item)}
        className={classNames(
          "flex w-full items-center justify-between gap-2 rounded-lg p-2.5 text-left transition-all duration-300 hover:bg-accent-gray dark:hover:bg-neutral-700 sm:py-2",
          item.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        )}
      >
        <div className="flex items-center gap-3 sm:gap-2">
          {item.imageUrl && (
            <Image
              src={item.imageUrl}
              alt={item.name}
              width={24}
              height={24}
              className="h-6 w-6 rounded-full object-cover"
            />
          )}
          <span className="text-text-body dark:text-white/80">
            {item.label ?? item.name}
          </span>
        </div>

        {!item.disabled && selectedItem?.name === item.name && (
          <Tick02Icon className="size-5 text-icon-outline-secondary dark:text-white/50" />
        )}

        {item.disabled && (
          <SquareLock02Icon className="size-4 text-icon-outline-secondary dark:text-white/50" />
        )}
      </li>
    ))}
  </ul>
);

export const FlexibleDropdown = ({
  defaultSelectedItem,
  selectedItem: controlledSelectedItem,
  onSelect,
  data,
  children,
  className,
  mobileTitle = "Select option",
}: FlexibleDropdownProps) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [selectedItem, setSelectedItem] = useState<DropdownItem | undefined>(
    defaultSelectedItem
      ? data?.find((item) => item.name === defaultSelectedItem)
      : undefined,
  );

  const handleChange = (item: DropdownItem) => {
    setSelectedItem(item);
    onSelect && onSelect(item.name);
    setIsOpen(false);
  };

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

  const dropdownRef = useRef<HTMLDivElement>(null);
  useOutsideClick({
    ref: dropdownRef,
    handler: () => setIsOpen(false),
  });

  const toggleDropdown = () => setIsOpen(!isOpen);

  const isMobile = () => {
    if (typeof window !== "undefined") {
      return window.innerWidth <= 640;
    }
    return false;
  };

  const handleMobileSelect = (item: DropdownItem) => {
    if (!item.disabled) {
      setSelectedItem(item);
      onSelect?.(item.name);
      setIsOpen(false);
    }
  };

  return (
    <div ref={dropdownRef} className="relative">
      {children({ selectedItem, isOpen, toggleDropdown })}

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Desktop dropdown */}
            <motion.div
              initial="closed"
              animate="open"
              exit="closed"
              variants={dropdownVariants}
              aria-label="Dropdown menu"
              className={classNames(
                "no-scrollbar absolute right-0 z-50 mt-2 max-h-52 max-w-full overflow-y-auto rounded-xl border border-border-light bg-white py-2 shadow-xl dark:border-white/10 dark:bg-neutral-800",
                className?.includes("min-w") ? "" : "min-w-40",
                className?.includes("max-h") ? "" : "max-h-56",
                className ?? "",
                "hidden sm:block",
              )}
            >
              <DropdownContent
                data={data}
                selectedItem={selectedItem}
                handleChange={handleChange}
              />
            </motion.div>

            {/* Mobile modal */}
            {isMobile() && (
              <Dialog
                static
                open={isOpen}
                onClose={() => setIsOpen(false)}
                key="mobile-dialog"
                className="relative z-[53] sm:hidden"
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
                      {data.map((item) => (
                        <button
                          key={item.name}
                          type="button"
                          disabled={item.disabled}
                          onClick={() => handleMobileSelect(item)}
                          className={classNames(
                            "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left transition-all hover:bg-accent-gray dark:hover:bg-neutral-700",
                            item.disabled
                              ? "cursor-not-allowed opacity-50"
                              : "cursor-pointer",
                          )}
                        >
                          <div className="flex items-center gap-3">
                            {item.imageUrl && (
                              <Image
                                src={item.imageUrl}
                                alt={item.name}
                                width={24}
                                height={24}
                                className="h-6 w-6 rounded-full object-cover"
                              />
                            )}
                            <span className="text-text-body dark:text-white/80">
                              {item.label ?? item.name}
                            </span>
                          </div>

                          {!item.disabled &&
                            selectedItem?.name === item.name && (
                              <Tick02Icon className="size-5 text-gray-400 dark:text-white/50" />
                            )}

                          {item.disabled && (
                            <SquareLock02Icon className="size-5 text-icon-outline-secondary dark:text-white/50" />
                          )}
                        </button>
                      ))}
                    </div>
                  </DialogPanel>
                </motion.div>
              </Dialog>
            )}
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
