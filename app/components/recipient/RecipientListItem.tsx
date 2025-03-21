import { Button } from "@headlessui/react";
import { RecipientListItemProps } from "@/app/components/recipient/types";
import { classNames, getRandomColor } from "@/app/utils";
import { Delete01Icon } from "hugeicons-react";

export const RecipientListItem = ({
  recipient,
  onSelect,
  onDelete,
  isBeingDeleted,
}: RecipientListItemProps) => (
  <div
    role="button"
    tabIndex={0}
    className={`group flex w-full cursor-pointer items-center justify-between rounded-2xl px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-white/5 ${
      isBeingDeleted ? "bg-red-100 dark:bg-red-900/30" : ""
    }`}
    onClick={() => onSelect(recipient)}
    onKeyDown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        onSelect(recipient);
      }
    }}
  >
    <div className="flex items-center gap-3">
      <div
        className={classNames(
          "grid size-11 place-content-center rounded-xl p-2 text-base text-white max-xsm:hidden",
          getRandomColor(recipient.name),
        )}
      >
        {recipient.name
          .split(" ")
          .filter((name) => name)
          .slice(0, 2)
          .map((name) => name[0].toUpperCase())
          .join("")}
      </div>
      <div>
        <p className="capitalize text-neutral-900 dark:text-white/80">
          {recipient.name.toLowerCase()}
        </p>
        <p className="flex flex-wrap items-center gap-x-1 text-gray-500 dark:text-white/50">
          <span>{recipient.accountIdentifier}</span>
          <span className="text-lg dark:text-white/5">•</span>
          <span>{recipient.institution}</span>
        </p>
      </div>
    </div>
    <Button
      onClick={(e) => {
        e.stopPropagation();
        onDelete(recipient);
      }}
      className="group/btn scale-0 transform rounded-lg p-2 opacity-0 transition-all duration-200 hover:bg-red-100 group-hover:scale-100 group-hover:opacity-100 dark:hover:bg-red-100/10"
    >
      <Delete01Icon
        className="size-4 text-icon-outline-secondary transition-colors group-hover/btn:text-red-500 dark:text-white/50 dark:group-hover/btn:text-red-400"
        strokeWidth={2}
      />
    </Button>
  </div>
);
