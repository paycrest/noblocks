"use client";
import { DropdownItem, FlexibleDropdown } from "./FlexibleDropdown";
import { classNames } from "../utils";
import { ArrowDown01Icon } from "hugeicons-react";
import FlagImage from "./FlagImage";
import { useState } from "react";

interface FormDropdownProps {
  defaultTitle: string;
  defaultSelectedItem?: string;
  onSelect?: (name: string) => void;
  data: DropdownItem[];
  className?: string;
  isCTA?: boolean;
  dropdownWidth?: number;
}

export const FormDropdown = ({
  defaultTitle,
  defaultSelectedItem,
  onSelect,
  data,
  className,
  isCTA = false,
  dropdownWidth,
}: FormDropdownProps) => {
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  return (
    <FlexibleDropdown
      data={data}
      defaultSelectedItem={defaultSelectedItem}
      onSelect={onSelect}
      className={className}
      dropdownWidth={dropdownWidth}
      mobileTitle={defaultTitle}
    >
      {({ selectedItem, isOpen, toggleDropdown }) => (
        <button
          id="dropdown"
          aria-label="Toggle dropdown"
          aria-haspopup="true"
          type="button"
          onClick={toggleDropdown}
          className={classNames(
            "flex h-9 items-center gap-1 rounded-full p-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white active:scale-95",
            selectedItem?.name
              ? "bg-gray-50 dark:bg-neutral-800"
              : isCTA
                ? "bg-lavender-500 text-white"
                : "bg-gray-50 dark:bg-neutral-800",
            "dark:focus-visible:ring-offset-neutral-900",
          )}
        >
          {selectedItem?.name ? (
            <div className="mr-1 flex items-center gap-1">
              <FlagImage
                item={selectedItem}
                imageErrors={imageErrors}
                setImageErrors={setImageErrors}
              />
              <p className="text-sm font-medium text-text-body dark:text-white">
                {selectedItem?.name}
              </p>
            </div>
          ) : (
            <p className="whitespace-nowrap pl-2 font-medium">
              {defaultTitle ? defaultTitle : "Select an option"}
            </p>
          )}

          <div
            className={classNames(
              selectedItem?.name && !imageErrors[selectedItem?.name]
                ? "ml-5"
                : "",
              "mr-1",
            )}
          >
            <ArrowDown01Icon
              className={classNames(
                "size-4 transition-transform",
                isOpen ? "rotate-180 transform" : "rotate-0",
                selectedItem?.name
                  ? "text-outline-gray dark:text-white/50"
                  : isCTA
                    ? "text-white"
                    : "text-outline-gray dark:text-white/50",
              )}
              strokeWidth={2}
            />
          </div>
        </button>
      )}
    </FlexibleDropdown>
  );
};
