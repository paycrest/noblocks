"use client"
import { DropdownItem, FlexibleDropdown } from "./FlexibleDropdown";
import Image from "next/image";
import { classNames } from "../utils";
import { ArrowDown01Icon } from "hugeicons-react";
import { useState } from "react";
import { currencyToCountryCode } from "../mocks";

interface FormDropdownProps {
  defaultTitle: string;
  defaultSelectedItem?: string;
  onSelect?: (name: string) => void;
  data: DropdownItem[];
  className?: string;
  isCTA?: boolean;
}

export const FormDropdown = ({
  defaultTitle,
  defaultSelectedItem,
  onSelect,
  data,
  className,
  isCTA = false,
}: FormDropdownProps) => {  
   const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  
   const getCountryCode = (currencyCode: string): string => {
     return currencyToCountryCode[currencyCode] || currencyCode.toLowerCase();
   };

  const filteredData = data.map(item => {
    if (item.imageUrl) return item;
    
    const countryCode = getCountryCode(item.name);
    return {
      ...item,
      imageUrl: `https://flagcdn.com/h24/${countryCode}.png`
    };
  });

  const renderImageOrFallback = (item: DropdownItem) => {
    if (imageErrors[item.name]) {
      return (
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 text-gray-600 font-bold">
          {item.name.substring(0,1)}
        </div>
      );
    };

    return (
      <Image
        alt={`${item?.name} Flag`}
        src={item?.imageUrl || ""}
        width={24}
        height={24}
        className="size-6 rounded-full object-fill"
        onError={() => {
          setImageErrors(prev => ({ ...prev, [item.name]: true }));
        }}
      />
    );
  };

  return (
    <FlexibleDropdown
      data={filteredData}
      defaultSelectedItem={defaultSelectedItem}
      onSelect={onSelect}
      className={className}
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
             {renderImageOrFallback(selectedItem)}
              <p className="text-sm font-medium text-text-body dark:text-white">
                {selectedItem?.name}
              </p>
            </div>
          ) : (
            <p className="whitespace-nowrap pl-2 font-medium">
              {defaultTitle ? defaultTitle : "Select an option"}
            </p>
          )}

          <div className={classNames(selectedItem?.name && !imageErrors[selectedItem?.name] ? "ml-5" : "", "mr-1")}>
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
