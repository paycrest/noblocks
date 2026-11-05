"use client";

import Link from "next/link";
import { ArrowRight01Icon } from "hugeicons-react";
import { classNames } from "@/app/utils";
import { formatPortfolioBucketUsd } from "@/app/lib/portfolio/display";
import { shellFocusRingClasses } from "../shellFocusStyles";

type AssetBucketRowProps = {
  title: string;
  subtitle: string;
  totalUsd: string;
  icon: React.ReactNode;
  href?: string;
  readOnly?: boolean;
  isLoading?: boolean;
};

export function AssetBucketRow({
  title,
  subtitle,
  totalUsd,
  icon,
  href,
  readOnly = false,
  isLoading = false,
}: AssetBucketRowProps) {
  const trailing = isLoading ? (
    <div className="h-5 w-16 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
  ) : (
    <span className="flex items-center gap-1 text-sm font-semibold text-text-body dark:text-white">
      {formatPortfolioBucketUsd(totalUsd)}
      {!readOnly ? (
        <ArrowRight01Icon className="size-4 text-icon-outline-secondary dark:text-white/40" />
      ) : null}
    </span>
  );

  const rowClasses = classNames(
    "flex w-full items-center gap-3 px-4 py-2 text-left transition-colors",
    !readOnly && href
      ? "hover:bg-accent-gray/60 dark:hover:bg-white/[0.04]"
      : "",
    !readOnly && href ? shellFocusRingClasses : "",
    !readOnly && href ? "rounded-md" : "",
  );

  const inner = (
    <>
      <span className="flex size-[35px] shrink-0 items-center justify-center rounded-[10px] bg-accent-gray text-icon-outline-secondary dark:bg-white/10 dark:text-white/70">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-text-body dark:text-white">
          {title}
        </span>
        <span className="block text-sm text-text-secondary dark:text-white/50">
          {subtitle}
        </span>
      </span>
      {trailing}
    </>
  );

  if (readOnly || !href) {
    return (
      <div className={rowClasses} data-readonly={readOnly ? "true" : undefined}>
        {inner}
      </div>
    );
  }

  return (
    <Link href={href} className={rowClasses}>
      {inner}
    </Link>
  );
}

export function AssetBucketListSkeleton() {
  return (
    <div className="divide-y divide-border-light dark:divide-white/10">
      {[1, 2, 3].map((key) => (
        <div key={key} className="flex items-center gap-3 px-4 py-2">
          <div className="size-[35px] animate-pulse rounded-[10px] bg-gray-200 dark:bg-white/10" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-28 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
            <div className="h-3 w-36 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
          </div>
          <div className="h-4 w-12 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
        </div>
      ))}
    </div>
  );
}
