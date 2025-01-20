import { DropdownItem, FlexibleDropdown } from "./FlexibleDropdown";
import Image from "next/image";
import { classNames } from "../utils";
import { ArrowDown01Icon } from "hugeicons-react";

interface FormDropdownProps {
  defaultTitle: string;
  defaultSelectedItem?: string;
  onSelect?: (name: string) => void;
  data: DropdownItem[];
  className?: string;
}

export const FormDropdown = ({
  defaultTitle,
  defaultSelectedItem,
  onSelect,
  data,
  className,
}: FormDropdownProps) => {
  return (
    <FlexibleDropdown
      data={data}
      defaultSelectedItem={defaultSelectedItem}
      onSelect={onSelect}
      className={className}
    >
      {({ selectedItem, isOpen, toggleDropdown }) => (
        <button
          id="dropdown"
          aria-label="Toggle dropdown"
          aria-haspopup="true"
          aria-expanded={isOpen}
          type="button"
          onClick={toggleDropdown}
          className={classNames(
            "flex items-center gap-2 rounded-full p-2.5 shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white active:scale-95",
            selectedItem?.name
              ? "bg-gray-50 dark:bg-neutral-800"
              : "bg-lavender-500 text-white",
            "dark:focus-visible:ring-offset-neutral-900",
          )}
        >
          {selectedItem?.name ? (
            <div className="flex items-center gap-1.5">
              <Image
                alt={selectedItem?.name}
                src={selectedItem?.imageUrl ?? ""}
                width={20}
                height={20}
                className="size-5 object-contain"
              />
              <p className="">{selectedItem?.name}</p>
            </div>
          ) : (
            <p className="whitespace-nowrap pl-1">
              {defaultTitle ? defaultTitle : "Select an option"}
            </p>
          )}

          <div className={classNames(selectedItem?.name ? "ml-5" : "")}>
            <ArrowDown01Icon
              className={classNames(
                "text-base text-gray-400 transition-transform",
                isOpen ? "rotate-180 transform" : "rotate-0",
                selectedItem?.name ? "dark:text-white/50" : "text-white",
              )}
            />
          </div>
        </button>
      )}
    </FlexibleDropdown>
  );
};
