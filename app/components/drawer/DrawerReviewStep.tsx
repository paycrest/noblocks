"use client";

import { Checkbox } from "@headlessui/react";
import type { ReactNode } from "react";

import { classNames } from "@/app/utils";

import { ActionSubmitButton } from "./ActionSubmitButton";
import {
  drawerBorderNeutral,
  drawerSecondaryText,
  drawerStepHeadingClasses,
} from "./drawerStyles";
import { ReviewDetailCard } from "./ReviewShared";
import type { ReviewDetailRow } from "./types";

export type DrawerReviewStepProps = {
  heading: string;
  subheading: ReactNode;
  detailRows: ReviewDetailRow[];
  expiresInSeconds?: number;
  confirmationLabel: string;
  confirmationChecked: boolean;
  onConfirmationChange: (checked: boolean) => void;
  submitLabel: string;
  submitDisabled?: boolean;
  isSubmitting?: boolean;
  onSubmit: () => void;
};

export function DrawerReviewStep({
  heading,
  subheading,
  detailRows,
  expiresInSeconds,
  confirmationLabel,
  confirmationChecked,
  onConfirmationChange,
  submitLabel,
  submitDisabled,
  isSubmitting,
  onSubmit,
}: DrawerReviewStepProps) {
  const ctaDisabled = submitDisabled || !confirmationChecked;

  return (
    <div className="flex w-full flex-col gap-6">
      <div>
        <p className={drawerStepHeadingClasses}>{heading}</p>
        <div className={classNames("text-sm leading-5", drawerSecondaryText)}>
          {subheading}
        </div>
      </div>

      <ReviewDetailCard rows={detailRows} expiresInSeconds={expiresInSeconds} />

      <Checkbox
        checked={confirmationChecked}
        onChange={onConfirmationChange}
        className="group flex cursor-pointer items-start gap-2 rounded-md text-left outline-none focus:outline-none data-[focus]:outline-none data-[focus-visible]:ring-2 data-[focus-visible]:ring-lavender-500 data-[focus-visible]:ring-offset-2 data-[focus-visible]:ring-offset-white dark:data-[focus-visible]:ring-offset-[#2b2b2b]"
      >
        <span
          className={classNames(
            "flex size-6 shrink-0 items-center justify-center rounded-md border-2",
            drawerBorderNeutral,
            "group-data-[checked]:border-lavender-500 group-data-[checked]:bg-lavender-500",
          )}
        >
          <svg
            className="size-3.5 text-white opacity-0 group-data-[checked]:opacity-100"
            viewBox="0 0 12 10"
            fill="none"
            aria-hidden
          >
            <path
              d="M1 5.5L4.5 9L11 1"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className={classNames("text-sm", drawerSecondaryText)}>
          {confirmationLabel}
        </span>
      </Checkbox>

      <ActionSubmitButton
        label={submitLabel}
        disabled={ctaDisabled}
        isSubmitting={isSubmitting}
        onClick={onSubmit}
      />
    </div>
  );
}
