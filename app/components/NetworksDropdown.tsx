import { FlexibleDropdown } from "./FlexibleDropdown";
import { PiCaretDown } from "react-icons/pi";
import Image from "next/image";
import { networks } from "../mocks";
import { classNames } from "../utils";

interface NetworksDropdownProps {
  onSelect?: (name: string) => void;
  iconOnly?: boolean;
}

export const NetworksDropdown = ({
  onSelect,
  iconOnly = false,
}: NetworksDropdownProps) => {
  return (
    <FlexibleDropdown
      data={networks}
      defaultSelectedItem="Base"
      onSelect={onSelect}
    >
      {({ selectedItem, isOpen, toggleDropdown }) => (
        <button
          id="networks-dropdown"
          aria-label="Toggle dropdown"
          aria-haspopup="true"
          aria-expanded={isOpen}
          type="button"
          onClick={toggleDropdown}
          className={classNames(
            "flex items-center justify-center gap-2 rounded-xl bg-gray-50 p-2.5 shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white active:scale-95 dark:bg-neutral-800 dark:focus-visible:ring-offset-neutral-900",
            iconOnly ? "pointer-events-none" : "",
          )}
        >
          <span>
            {selectedItem?.name ? (
              <div className="flex items-center gap-2">
                <Image
                  alt={selectedItem?.name}
                  src={selectedItem?.imageUrl ?? ""}
                  width={20}
                  height={20}
                />
                {!iconOnly && (
                  <p className="hidden sm:block">{selectedItem?.name}</p>
                )}
              </div>
            ) : (
              <p>{iconOnly ? "Select" : "Select a network"}</p>
            )}
          </span>
          {!iconOnly && (
            <PiCaretDown
              className={classNames(
                "text-base text-gray-400 transition-transform dark:text-white/50",
                isOpen ? "rotate-180" : "",
              )}
              aria-label="Caret down"
            />
          )}
        </button>
      )}
    </FlexibleDropdown>
  );
};
