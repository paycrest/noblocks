"use client";

import { toast } from "sonner";
import { CheckmarkCircle01Icon } from "hugeicons-react";

import { classNames } from "@/app/utils";

import {
  drawerDividerClasses,
  drawerHeadingText,
  drawerSecondaryText,
} from "./drawerStyles";

/**
 * Success toast pattern from Figma (2631:134140): green title + divider + body.
 */
export function showActionSuccessToast(title: string, description: string) {
  toast.custom(
    () => (
      <div
        role="status"
        className={classNames(
          "w-[min(100vw-2rem,20rem)] overflow-hidden rounded-2xl border border-border-light bg-white shadow-2xl",
          "dark:border-white/10 dark:bg-[#202020]",
        )}
      >
        <div className="flex items-center gap-2.5 px-3.5 py-2.5">
          <CheckmarkCircle01Icon className="size-4 shrink-0 text-[#39c65d]" />
          <p className="text-sm font-medium text-[#39c65d]">{title}</p>
        </div>
        <hr className={drawerDividerClasses} />
        <p className={classNames("px-3.5 py-2.5 text-sm", drawerHeadingText)}>
          {description}
        </p>
      </div>
    ),
    { duration: 5000 },
  );
}
