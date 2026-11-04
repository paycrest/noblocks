"use client";

import { classNames } from "@/app/utils";

import { drawerSuccessIconClasses } from "./drawerStyles";

type SuccessCheckmarkProps = {
  size: 54 | 40;
  strokeWidth: number;
  className?: string;
};

/** Outline checkmark circle matching Figma stroke weights. */
export function SuccessCheckmark({
  size,
  strokeWidth,
  className,
}: SuccessCheckmarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 54 54"
      fill="none"
      aria-hidden
      className={classNames(drawerSuccessIconClasses, className)}
    >
      <circle
        cx="27"
        cy="27"
        r={27 - strokeWidth}
        stroke="currentColor"
        strokeWidth={strokeWidth}
      />
      <path
        d="M16 27.5L24 35.5L38 19.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
