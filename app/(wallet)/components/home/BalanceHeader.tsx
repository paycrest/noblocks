"use client";

import { BalanceSkeleton } from "@/app/components/BalanceSkeleton";
import { formatPortfolioUsd } from "@/app/lib/portfolio/display";

type BalanceHeaderProps = {
  isLoading: boolean;
  totalUsd: string | null;
  trailing?: React.ReactNode;
};

export function BalanceHeader({
  isLoading,
  totalUsd,
  trailing,
}: BalanceHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <p className="text-sm text-text-secondary dark:text-white/50">
          Your balances
        </p>
        {isLoading ? (
          <BalanceSkeleton className="h-10 w-36 rounded-lg" />
        ) : (
          <p className="text-[40px] font-semibold leading-none tracking-tight text-text-body dark:text-white">
            {totalUsd != null ? formatPortfolioUsd(totalUsd) : "—"}
          </p>
        )}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}
