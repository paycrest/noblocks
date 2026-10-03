"use client";
import React, { useState } from "react";
import { DropdownItem } from "./FlexibleDropdown";
import Image from "next/image";
import { classNames } from "../utils";

type Props = {
  item: DropdownItem;
  imageErrors: Record<string, boolean>;
  setImageErrors: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
};

const FlagImage = ({ item, imageErrors, setImageErrors }: Props) => {
  // Remote flag images are rectangular and need the circular crop. Local
  // network/token logos are already shaped (e.g. Base's rounded square), so
  // clipping them to a circle would distort the mark.
  const isLocalLogo = item.imageUrl?.startsWith("/logos/") ?? false;

  return (
    <>
      {imageErrors[item.name] ? (
        // Show text-based fallback
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 font-bold text-gray-600">
          {item?.name.substring(0, 1).toUpperCase()}
        </div>
      ) : (
        // Show Image
        item?.imageUrl && (
          <Image
            src={item.imageUrl}
            alt={item.name}
            width={24}
            height={24}
            loading="lazy"
            decoding="async"
            className={classNames(
              "h-6 w-6",
              isLocalLogo ? "" : "rounded-full object-fill",
            )}
            onError={() =>
              setImageErrors((prev) => ({ ...prev, [item.name]: true }))
            }
          />
        )
      )}
    </>
  );
};

export default FlagImage;
