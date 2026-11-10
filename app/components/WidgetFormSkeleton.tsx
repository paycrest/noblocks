"use client";

import { BalanceSkeleton } from "./BalanceSkeleton";

/**
 * Embed (/widget) loading state: card-shaped skeleton matching WidgetShell
 * geometry (fills the iframe viewport) instead of a full-screen splash.
 */
export function WidgetFormSkeleton() {
  return (
    <div
      className="flex h-dvh w-full flex-col rounded-3xl bg-white p-4 dark:bg-neutral-900"
      data-testid="widget-form-skeleton"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="mb-3 flex min-h-10 items-center justify-end">
        <BalanceSkeleton className="h-10 w-16 rounded-xl" />
      </div>
      <div className="space-y-2 rounded-2xl bg-gray-50 p-2 dark:bg-neutral-800/20">
        <div className="px-2 py-1">
          <BalanceSkeleton className="h-4 w-16" />
        </div>
        <div className="space-y-3.5 rounded-2xl bg-white px-4 py-3 dark:bg-neutral-900">
          <BalanceSkeleton className="h-4 w-12" />
          <BalanceSkeleton className="h-14 w-full" />
        </div>
        <div className="space-y-3.5 rounded-2xl bg-white px-4 py-3 dark:bg-neutral-900">
          <BalanceSkeleton className="h-4 w-16" />
          <BalanceSkeleton className="h-14 w-full" />
        </div>
      </div>
      <BalanceSkeleton className="mt-4 h-11 w-full rounded-xl" />
      <div className="mt-auto flex items-center justify-center gap-2 border-t border-gray-100 pb-2 pt-5 dark:border-white/5">
        <BalanceSkeleton className="size-6 rounded-full" />
        <BalanceSkeleton className="h-4 w-36" />
      </div>
    </div>
  );
}
