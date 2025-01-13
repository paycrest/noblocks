"use client";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { useOutsideClick } from "../hooks";
import { MdOutlineLockClock } from "react-icons/md";
import { dropdownVariants } from "./AnimatedComponents";
import { useEffect, useRef, useState, ReactNode } from "react";
import { Tick01Icon } from "hugeicons-react";

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
}

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

export const FlexibleDropdown = ({
  defaultSelectedItem,
  selectedItem: controlledSelectedItem,
  onSelect,
  data,
  children,
  className,
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

  return (
    <div ref={dropdownRef} className="relative">
      {children({ selectedItem, isOpen, toggleDropdown })}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial="closed"
            animate="open"
            exit="closed"
            variants={dropdownVariants}
            aria-label="Dropdown menu"
            className={classNames(
              "absolute right-0 z-10 mt-2 max-h-52 max-w-full overflow-y-auto rounded-xl bg-gray-50 shadow-xl dark:bg-neutral-800",
              className?.includes("min-w") ? "" : "min-w-40",
              className?.includes("max-h") ? "" : "max-h-52",
              className ?? "",
            )}
          >
            <ul role="list" aria-labelledby="networks-dropdown">
              {data?.map((item) => (
                <li
                  key={item.name}
                  onClick={() => !item.disabled && handleChange(item)}
                  className={classNames(
                    "flex items-center justify-between gap-2 px-3 py-2 transition-all hover:bg-gray-200 dark:hover:bg-neutral-700",
                    item?.disabled
                      ? "pointer-events-none cursor-not-allowed"
                      : "cursor-pointer",
                  )}
                >
                  <div className="flex items-center gap-1">
                    {item.imageUrl && (
                      <Image
                        src={item.imageUrl ?? ""}
                        alt="image"
                        loading="lazy"
                        width={20}
                        height={20}
                        className="me-2 h-5 w-5 rounded-full object-cover"
                      />
                    )}

                    <span className="text-neutral-900 dark:text-white/80">
                      {item.label ?? item.name}
                    </span>
                  </div>

                  {item.disabled ? (
                    <MdOutlineLockClock className="text-lg text-gray-400 dark:text-white/50" />
                  ) : (
                    <Tick01Icon
                      className={classNames(
                        "text-lg text-gray-400 transition-transform dark:text-white/50",
                        selectedItem?.name === item.name ? "" : "hidden",
                      )}
                    />
                  )}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
