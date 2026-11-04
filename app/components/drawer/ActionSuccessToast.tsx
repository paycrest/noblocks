"use client";

import { toast } from "sonner";
import { CheckmarkCircle01Icon } from "hugeicons-react";

import { classNames } from "@/app/utils";

import { drawerBodyText, drawerSuccessIconClasses } from "./drawerStyles";

/**
 * Success toast pattern from Figma (2631:134140): green title + divider + body.
 */
export function showActionSuccessToast(title: string, description: string) {
  toast.custom(
    () => (
      <div
        role="status"
        className={classNames(
          "w-[min(100vw-2rem,20rem)] overflow-hidden rounded-2xl border border-border-light bg-white shadow-sm dark:border-[0.5px] dark:border-white/10 dark:bg-[#202020] dark:shadow-2xl",
        )}
      >
        <div className="flex items-center gap-2.5 px-3.5 py-2.5">
          <CheckmarkCircle01Icon
            className={classNames("size-4 shrink-0", drawerSuccessIconClasses)}
          />
          <p className="text-sm font-medium leading-5 text-[#227738] dark:text-[#39c65d]">
            {title}
          </p>
        </div>
        <hr className="border-border-light dark:border-white/10" />
        <p className={classNames("px-3.5 py-2.5 text-sm leading-5", drawerBodyText)}>
          {description}
        </p>
      </div>
    ),
    { duration: 5000, position: "top-center", style: { top: "20px" } },
  );
}
