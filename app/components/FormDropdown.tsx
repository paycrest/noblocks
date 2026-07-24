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
  /** Embed allowlist lock: pill keeps its normal look but can't open (no chevron). */
  disabled?: boolean;
}

export const FormDropdown = ({
  defaultTitle,
  defaultSelectedItem,
  onSelect,
  data,
  className,
  isCTA = false,
  dropdownWidth,
  disabled = false,
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
      disabled={disabled}
    >
      {({ selectedItem, isOpen, toggleDropdown, disabled: isLocked }) => (
        <button
          id="dropdown"
          aria-label={
            isLocked
              ? `${selectedItem?.name ?? defaultTitle} (locked)`
              : "Toggle dropdown"
          }
          aria-haspopup={isLocked ? undefined : "true"}
          aria-expanded={isLocked ? undefined : isOpen}
          type="button"
          disabled={isLocked}
          onClick={toggleDropdown}
          className={classNames(
            "flex h-9 items-center gap-1 rounded-full p-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
            isLocked ? "cursor-default" : "active:scale-95",
            selectedItem?.name
              ? "bg-gray-50 dark:bg-neutral-800"
              : isCTA
                ? "bg-lavender-500 text-white"
                : "bg-gray-50 dark:bg-neutral-800",
            "dark:focus-visible:ring-offset-neutral-900",
          )}
        >
          {selectedItem?.name ? (
            // Never let the label shrink or wrap: it would spill outside the
            // pill's background. Callers must give the pill room to keep its
            // natural width (see the flex-shrink-0 wrappers in TransactionForm).
            <div className="mr-0 flex shrink-0 items-center gap-1 bg-gray-50 dark:bg-neutral-800">
              <FlagImage
                item={selectedItem}
                imageErrors={imageErrors}
                setImageErrors={setImageErrors}
              />
              <p className="whitespace-nowrap text-sm font-medium text-text-body dark:text-white">
                {selectedItem?.name}
              </p>
            </div>
          ) : (
            // pl-2 balances the label against the chevron on the right; with no
            // chevron there is nothing to balance, so pad both sides equally.
            <p
              className={classNames(
                "whitespace-nowrap font-medium",
                isLocked ? "px-2" : "pl-2",
              )}
            >
              {defaultTitle ? defaultTitle : "Select an option"}
            </p>
          )}

          {!isLocked && (
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
          )}
        </button>
      )}
    </FlexibleDropdown>
  );
};
