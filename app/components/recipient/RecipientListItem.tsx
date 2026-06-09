"use client";

import { Button } from "@headlessui/react";
import { RecipientListItemProps } from "@/app/components/recipient/types";
import { classNames, getRandomColor, shortenAddress, resolveEnsNameOrShorten, getAvatarImage, isWalletRecipient } from "@/app/utils";
import { Delete01Icon } from "hugeicons-react";
import { ImSpinner } from "react-icons/im";
import Image from "next/image";
import { useEffect, useState } from "react";

export const RecipientListItem = ({
  recipient,
  onSelect,
  onDelete,
  isBeingDeleted,
  index = 0,
}: RecipientListItemProps) => {
  const [displayName, setDisplayName] = useState<string>("");
  const [isResolvingEns, setIsResolvingEns] = useState(false);

  // Use type predicate for better type narrowing
  const walletRecipient = isWalletRecipient(recipient);
  const avatarSrc = walletRecipient ? getAvatarImage(index) : null;

  // Type guard: safely access walletAddress only for wallet recipients
  const walletAddress = walletRecipient ? recipient.walletAddress : "";

  // Resolve ENS name for wallet recipients (onramp)
  useEffect(() => {
    if (walletRecipient && walletAddress) {
      setIsResolvingEns(true);
      resolveEnsNameOrShorten(walletAddress)
        .then((name) => {
          setDisplayName(name);
          setIsResolvingEns(false);
        })
        .catch(() => {
          // Fallback to first 5 chars if resolution fails
          setDisplayName(walletAddress.slice(2, 7));
          setIsResolvingEns(false);
        });
    }
  }, [recipient, walletAddress]);

  return (
    <div
      role="button"
      tabIndex={0}
      className={`group flex w-full cursor-pointer items-center justify-between rounded-lg border-b border-gray-100 px-3 py-2.5 text-left text-sm transition-all last:border-b-0 hover:rounded-xl hover:bg-gray-100 dark:border-white/5 dark:hover:bg-white/5 ${isBeingDeleted ? "bg-red-100 dark:bg-red-900/30" : ""
        }`}
      onClick={() => onSelect(recipient)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          onSelect(recipient);
        }
      }}
    >
      <div className="flex items-center gap-3">
        {!walletRecipient ? (
          <>
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
          </>
        ) : (
          <>
            {avatarSrc && (
              <div className="relative size-11 flex-shrink-0 max-xsm:hidden">
                <Image
                  src={avatarSrc}
                  alt={recipient.name || "Wallet address"}
                  width={44}
                  height={44}
                  className="size-11 rounded-xl object-cover"
                />
              </div>
            )}
            <div>
              <p className="text-neutral-900 dark:text-white/80">
                {recipient.name || (isResolvingEns ? (
                  <span className="text-gray-400 dark:text-white/30">Resolving...</span>
                ) : (
                  displayName || shortenAddress(walletAddress, 6, 4)
                ))}
              </p>
              <p className="text-gray-500 dark:text-white/50">
                {shortenAddress(walletAddress, 6, 4)}
              </p>
            </div>
          </>
        )}
      </div>
      <Button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(recipient);
        }}
        className={`group/btn transform rounded-lg p-2 transition-all duration-200 hover:bg-red-100 dark:hover:bg-red-100/10 ${isBeingDeleted
          ? "scale-100 opacity-100"
          : "scale-0 opacity-0 group-hover:scale-100 group-hover:opacity-100"
          }`}
        disabled={isBeingDeleted}
      >
        {isBeingDeleted ? (
          <ImSpinner className="size-4 animate-spin text-icon-outline-secondary dark:text-white/50" />
        ) : (
          <Delete01Icon
            className="size-4 text-icon-outline-secondary transition-colors group-hover/btn:text-red-500 dark:text-white/50 dark:group-hover/btn:text-red-400"
            strokeWidth={2}
          />
        )}
      </Button>
    </div>
  );
};