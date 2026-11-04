"use client";

import { Checkbox } from "@headlessui/react";
import type { ReactNode } from "react";

import { classNames } from "@/app/utils";

import { ActionSubmitButton } from "./ActionSubmitButton";
import { ReviewDetailCard } from "./ReviewShared";
import type { ReviewDetailRow } from "./types";

export type DrawerReviewStepProps = {
  heading: string;
  subheading: ReactNode;
  detailRows: ReviewDetailRow[];
  expiresInLabel?: string;
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
  expiresInLabel,
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
        <p className="text-base font-medium text-white/80">{heading}</p>
        <div className="text-sm text-white/50">{subheading}</div>
      </div>

      <ReviewDetailCard rows={detailRows} />

      {expiresInLabel ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-white/50">Expires in</span>
          <span className="rounded-full bg-white/10 px-3 py-1 text-sm text-lavender-500">
            {expiresInLabel}
          </span>
        </div>
      ) : null}

      <Checkbox
        checked={confirmationChecked}
        onChange={onConfirmationChange}
        className="group flex cursor-pointer items-start gap-3 text-left"
      >
        <span
          className={classNames(
            "mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded border-2 border-white/30",
            "group-data-[checked]:border-lavender-500 group-data-[checked]:bg-lavender-500",
          )}
        >
          <svg
            className="size-3 text-white opacity-0 group-data-[checked]:opacity-100"
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
        <span className="text-sm text-white/80">{confirmationLabel}</span>
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
