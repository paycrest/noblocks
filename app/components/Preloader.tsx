import { AnimatePresence, motion } from "framer-motion";

const Skeleton = ({ className }: { className?: string }) => (
  <div
    className={`animate-pulse rounded-xl bg-gray-200 dark:bg-[#1a1a1a] ${className}`}
  />
);

const NavbarSkeleton = () => (
  <header className="fixed left-0 top-0 z-20 w-full">
    <nav className="mx-auto flex items-center justify-between p-4 xl:container lg:px-8">
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="flex items-center gap-4">
        <Skeleton className="h-9 w-10" />
      </div>
    </nav>
  </header>
);

const HeroHeaderSkeleton = () => (
  <div className="mb-8 flex flex-col items-center gap-2 text-center sm:mb-12 md:mb-16 lg:mb-20">
    {/* "Change stablecoins" line */}
    <Skeleton className="h-6 w-80 max-w-[90vw] sm:h-10 sm:w-96 md:h-12 md:w-[28rem] lg:h-16 lg:w-[32rem]" />
    {/* "to cash in seconds" line */}
    <Skeleton className="h-6 w-72 max-w-[85vw] sm:h-12 sm:w-80 md:h-14 md:w-96 lg:h-[4.5rem] lg:w-[30rem]" />
  </div>
);

const ScrollIndicatorSkeleton = () => (
  <div className="fixed -bottom-10 z-40 flex w-full -translate-x-1/2 flex-col items-center">
    {/* Scroll arrow line */}
    <Skeleton className="mb-3 h-8 w-0.5 sm:h-14" />
    {/* "Scroll down to learn more" text */}
    <Skeleton className="h-4 w-48" />
    {/* Arrow head */}
    <Skeleton className="mt-3 h-3 w-3" />
  </div>
);

export const Preloader = ({ isLoading }: { isLoading: boolean }) => {
  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-50 flex min-h-screen flex-col justify-center bg-white px-4 dark:bg-neutral-900"
        >
          <NavbarSkeleton />

          {/* Hero Section */}
          <div className="flex flex-1 flex-col items-center justify-center">
            <HeroHeaderSkeleton />

            {/* Transaction Form Skeleton */}
            <div className="mx-auto w-full max-w-md">
              {/* Swap Section */}
              <div className="space-y-2 rounded-2xl bg-gray-50 p-2 dark:bg-neutral-800">
                <div className="flex items-center justify-between px-2 py-1">
                  <Skeleton className="h-4 w-16" />
                </div>

                {/* Send Section */}
                <div className="relative space-y-3.5 rounded-2xl bg-white px-4 py-3 dark:bg-neutral-900">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-32" />
                  </div>

                  <Skeleton className="h-16 w-full" />

                  {/* Arrow */}
                  <div className="absolute -bottom-5 left-1/2 z-10 w-fit -translate-x-1/2 rounded-xl border-4 border-gray-50 bg-gray-50 dark:border-neutral-800 dark:bg-neutral-800">
                    <div className="rounded-lg bg-white p-1 dark:bg-neutral-900">
                      <Skeleton className="h-6 w-6" />
                    </div>
                  </div>
                </div>

                {/* Receive Section */}
                <div className="space-y-3.5 rounded-2xl bg-white px-4 py-3 dark:bg-neutral-900">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-16 w-full" />
                </div>
              </div>

              {/* Button */}
              <Skeleton className="mt-6 h-11 w-full rounded-xl" />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
