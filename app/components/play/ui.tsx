"use client";

/**
 * Noblocks Play — tiny shared UI primitives (cards, skeletons, empty/error
 * states) matching the app's design tokens (lavender / accent-gray /
 * border-light, dark mode via class).
 */

import { ReactNode } from "react";
import { Alert02Icon, RefreshIcon } from "hugeicons-react";

export const PlayCard = ({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div
    className={`rounded-2xl border border-border-light bg-white p-4 dark:border-white/10 dark:bg-surface-canvas ${className}`}
  >
    {children}
  </div>
);

export const Skeleton = ({ className = "" }: { className?: string }) => (
  <div
    className={`animate-pulse rounded-lg bg-gray-200 dark:bg-white/10 ${className}`}
  />
);

export const EmptyState = ({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) => (
  <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-light px-6 py-10 text-center dark:border-white/10">
    {icon}
    <p className="text-sm font-semibold text-text-body dark:text-white">
      {title}
    </p>
    {description && (
      <p className="max-w-sm text-sm text-text-secondary dark:text-white/50">
        {description}
      </p>
    )}
    {action}
  </div>
);

export const ErrorState = ({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) => (
  <div className="flex flex-col items-center gap-3 rounded-2xl border border-border-light px-6 py-10 text-center dark:border-white/10">
    <Alert02Icon className="size-6 text-accent-red" />
    <p className="text-sm text-text-secondary dark:text-white/50">
      {message ?? "Something went wrong loading this section."}
    </p>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="flex min-h-11 items-center gap-2 rounded-xl bg-accent-gray px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-accent-gray/80 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
      >
        <RefreshIcon className="size-4" />
        Try again
      </button>
    )}
  </div>
);

export const primaryButtonClasses =
  "min-h-11 rounded-xl bg-lavender-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-lavender-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:dark:bg-white/5 disabled:dark:text-white/30";

export const secondaryButtonClasses =
  "min-h-11 rounded-xl bg-accent-gray px-4 py-2.5 text-sm font-medium text-gray-900 transition-colors hover:bg-accent-gray/80 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/5 dark:text-white dark:hover:bg-white/10";

/** Small pill chip. */
export const Chip = ({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "lavender" | "green" | "red" | "amber";
  className?: string;
}) => {
  const tones: Record<string, string> = {
    neutral:
      "bg-accent-gray text-text-secondary dark:bg-white/5 dark:text-white/50",
    lavender:
      "bg-lavender-100 text-lavender-800 dark:bg-lavender-500/15 dark:text-lavender-300 min-w-fit items-center justify-center",
    green:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
    red: "bg-background-accent-red text-text-accent-red dark:bg-accent-red/10 dark:text-accent-red",
    amber:
      "bg-yellow-secondary text-warning-foreground dark:bg-yellow-primary/10 dark:text-yellow-primary w-40 items-center justify-center",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
};
