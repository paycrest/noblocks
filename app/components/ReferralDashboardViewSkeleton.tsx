export const ReferralDashboardViewSkeleton = () => {
    return (
        <div className="scrollbar-hide max-h-[95vh] overflow-y-scroll pb-12">
            {/* Header */}
            <div className="mb-6 items-center gap-4">
                <div className="pb-4">
                    <div className="h-5 w-5 animate-pulse rounded-lg bg-gray-200 dark:bg-white/10" />
                </div>
                <div className="h-7 w-24 animate-pulse rounded-lg bg-gray-200 dark:bg-white/10" />
            </div>

            {/* Earnings Summary */}
            <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border-light bg-border-light dark:border-white/10 dark:bg-transparent">
                <div className="border-r border-border-light bg-white p-4 dark:border-white/10 dark:bg-[#141414]">
                    <div className="mb-2 h-4 w-16 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
                    <div className="h-6 w-24 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
                </div>
                <div className="bg-white p-4 dark:bg-[#141414]">
                    <div className="mb-2 h-4 w-16 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
                    <div className="h-6 w-20 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
                </div>
            </div>

            {/* Referral Code Card */}
            <div className="mb-4 space-y-3 rounded-2xl border border-border-light bg-white p-4 dark:border-white/10 dark:bg-[#141414]">
                <div className="h-4 w-28 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
                <div className="flex items-center justify-between">
                    <div className="h-8 w-32 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
                    <div className="h-9 w-20 animate-pulse rounded-lg bg-gray-200 dark:bg-white/10" />
                </div>
            </div>

            {/* Copy Link Button */}
            <div className="mb-4">
                <div className="h-11 w-full animate-pulse rounded-xl bg-gray-200 dark:bg-white/10" />
            </div>

            {/* Description */}
            <div className="mb-6 space-y-2">
                <div className="h-4 w-full animate-pulse rounded bg-gray-200 dark:bg-white/10" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
            </div>

            {/* Tabs */}
            <div className="mb-4 flex gap-6">
                <div className="h-6 w-16 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
                <div className="h-6 w-16 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
            </div>

            {/* Referral List Items */}
            <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center justify-between py-1">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 animate-pulse rounded-full bg-gray-200 dark:bg-white/10" />
                            <div className="h-5 w-24 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
                        </div>
                        <div className="h-5 w-16 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
                    </div>
                ))}
            </div>
        </div>
    );
};