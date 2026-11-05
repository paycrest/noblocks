"use client";

import { classNames } from "@/app/utils";
import { shellFocusRingClasses } from "../shellFocusStyles";

type HomePortfolioErrorProps = {
  message?: string;
  onRetry: () => void;
};

export function HomePortfolioError({
  message = "We couldn't load your balances.",
  onRetry,
}: HomePortfolioErrorProps) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-border-light bg-accent-gray/40 px-4 py-3 dark:border-white/10 dark:bg-white/5"
    >
      <p className="text-sm text-text-body dark:text-white">{message}</p>
      <button
        type="button"
        onClick={() => void onRetry()}
        className={classNames(
          "mt-2 text-sm font-semibold underline-offset-2 hover:underline",
          "text-[#0065F5] dark:text-lavender-500",
          shellFocusRingClasses,
          "rounded-md",
        )}
      >
        Try again
      </button>
    </div>
  );
}
