import { DropdownItem, FlexibleDropdown } from "./FlexibleDropdown";
import { PiCaretDown } from "react-icons/pi";
import Image from "next/image";
import { classNames } from "../utils";

interface FormDropdownProps {
  defaultTitle: string;
  defaultSelectedItem: string;
  onSelect?: (name: string) => void;
  data: DropdownItem[];
}

export const FormDropdown = ({
  defaultTitle,
  defaultSelectedItem,
  onSelect,
  data,
}: FormDropdownProps) => {
  return (
    <FlexibleDropdown
      data={data}
      defaultSelectedItem={defaultSelectedItem}
      onSelect={onSelect}
    >
      {({ selectedItem, isOpen, toggleDropdown }) => (
        <button
          id="dropdown"
          aria-label="Toggle dropdown"
          aria-haspopup="true"
          aria-expanded={isOpen}
          type="button"
          onClick={toggleDropdown}
          className="flex items-center gap-2 rounded-full bg-gray-50 p-2.5 shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white active:scale-95 dark:bg-neutral-800 dark:focus-visible:ring-offset-neutral-900"
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
            <p className="whitespace-nowrap">
              {defaultTitle ? defaultTitle : "Select an option"}
            </p>
          )}

          <PiCaretDown
            className={classNames(
              "text-lg text-gray-400 transition-transform dark:text-white/50",
              isOpen ? "rotate-180" : "",
              selectedItem?.name ? "ml-5" : "",
            )}
          />
        </button>
      )}
    </FlexibleDropdown>
  );
};
