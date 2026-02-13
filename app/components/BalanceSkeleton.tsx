export const BalanceSkeleton = ({ className = "" }: { className?: string }) => (
  <div
    className={`h-6 w-16 animate-pulse rounded-md bg-gray-200 dark:bg-white/10 ${className}`}
  />
);

export const BalanceCardSkeleton = () => (
  <div className="space-y-4">
    {[1, 2, 3].map((index) => (
      <div key={index} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-8 animate-pulse rounded-full bg-gray-200 dark:bg-white/10" />
          <div className="space-y-2">
            <div className="h-4 w-16 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
            <div className="h-4 w-12 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
          </div>
        </div>
        <div className="h-4 w-20 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
      </div>
    ))}
  </div>
);
