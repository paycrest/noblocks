"use client";

import { ImSpinner } from "react-icons/im";

import { classNames } from "@/app/utils";

import {
  drawerPrimaryButtonClasses,
  drawerSecondaryButtonClasses,
} from "./drawerStyles";

type ActionSubmitButtonProps = {
  label: string;
  disabled?: boolean;
  isSubmitting?: boolean;
  onClick: () => void;
  className?: string;
  variant?: "primary" | "secondary" | "pill";
};

export function ActionSubmitButton({
  label,
  disabled,
  isSubmitting,
  onClick,
  className,
  variant = "primary",
}: ActionSubmitButtonProps) {
  const isDisabled = Boolean(disabled || isSubmitting);

  const base =
    variant === "pill"
      ? "inline-flex h-8 items-center justify-center rounded-xl bg-lavender-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-lavender-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500 disabled:cursor-not-allowed disabled:bg-[#2e2e2e] disabled:text-white/50"
      : variant === "secondary"
        ? drawerSecondaryButtonClasses
        : drawerPrimaryButtonClasses;

  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={onClick}
      aria-busy={isSubmitting || undefined}
      aria-label={isSubmitting ? `${label} loading` : label}
      className={classNames(base, className)}
    >
      {isSubmitting ? (
        <ImSpinner className="size-5 animate-spin" aria-hidden />
      ) : (
        label
      )}
    </button>
  );
}
