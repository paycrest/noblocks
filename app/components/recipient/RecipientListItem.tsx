import { Button } from "@headlessui/react";
import { TrashIcon } from "../ImageAssets";
import { RecipientListItemProps } from "./types";
import { classNames, getRandomColor } from "@/app/utils";

export const RecipientListItem = ({
  recipient,
  onSelect,
  onDelete,
  isBeingDeleted,
}: RecipientListItemProps) => (
  <div
    role="button"
    tabIndex={0}
    className={`group flex w-full cursor-pointer items-center justify-between rounded-2xl px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-white/5 ${
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
          "hidden size-11 rounded-xl p-2 text-base text-white sm:grid sm:place-content-center",
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
      className="group-hover:block sm:hidden"
    >
      <TrashIcon className="size-4 stroke-gray-500 dark:stroke-white/50" />
    </Button>
  </div>
);
