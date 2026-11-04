"use client";

import { ImSpinner } from "react-icons/im";

import { classNames } from "@/app/utils";
import { primaryBtnClasses } from "@/app/components/Styles";

type ActionSubmitButtonProps = {
  label: string;
  disabled?: boolean;
  isSubmitting?: boolean;
  onClick: () => void;
  className?: string;
  variant?: "primary" | "secondary";
};

/**
 * Primary drawer CTA. Loading state follows existing Noblocks pattern (spinner
 * icon) — design gap G13: no dedicated loading frame in Figma.
 */
export function ActionSubmitButton({
  label,
  disabled,
  isSubmitting,
  onClick,
  className,
  variant = "primary",
}: ActionSubmitButtonProps) {
  const isDisabled = Boolean(disabled || isSubmitting);

  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={onClick}
      aria-busy={isSubmitting || undefined}
      aria-label={isSubmitting ? `${label} loading` : label}
      className={classNames(
        variant === "primary"
          ? classNames(
              primaryBtnClasses,
              "h-11 w-full rounded-xl bg-lavender-500 disabled:bg-[#2e2e2e] disabled:text-white/50",
            )
          : "flex h-11 w-full items-center justify-center rounded-xl bg-white/10 text-sm font-medium text-white transition-colors hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      {isSubmitting ? (
        <ImSpinner className="size-5 animate-spin" aria-hidden />
      ) : (
        label
      )}
    </button>
  );
}
