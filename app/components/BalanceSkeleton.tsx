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

export const MobileBalanceCardSkeleton = () => (
  <div className="space-y-2">
    {[1, 2, 3].map((index) => (
      <div key={index} className="flex items-center gap-1">
        <div className="size-3.5 animate-pulse rounded-full bg-gray-200 dark:bg-white/10" />
        <div className="h-4 w-20 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
      </div>
    ))}
  </div>
);

export const CrossChainBalanceSkeleton = ({
  isMobile = false,
}: {
  isMobile?: boolean;
}) => (
  <div className="space-y-6">
    {[1, 2].map((groupIndex) => (
      <div key={groupIndex} className="space-y-3">
        <div className="flex items-center justify-between gap-x-6">
          <div className="h-4 w-20 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
          <div className="h-px flex-1 bg-gray-200 dark:bg-white/10" />
        </div>

        {isMobile ? (
          <MobileBalanceCardSkeleton />
        ) : (
          <div className="space-y-4">
            {[1, 2].map((index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="size-8 animate-pulse rounded-full bg-gray-200 dark:bg-white/10" />
                    <div className="absolute -bottom-1 -right-1 size-4 animate-pulse rounded-full bg-gray-200 dark:bg-white/10" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 w-16 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
                    <div className="h-4 w-12 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
                  </div>
                </div>
                <div className="h-4 w-20 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
              </div>
            ))}
          </div>
        )}
      </div>
    ))}
  </div>
);
