"use client";

import { ImSpinner } from "react-icons/im";

import { classNames } from "@/app/utils";

import {
  drawerPillPrimaryButtonClasses,
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
      ? drawerPillPrimaryButtonClasses
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
