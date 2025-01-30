import { AnimatePresence, motion } from "framer-motion";

const Skeleton = ({ className }: { className?: string }) => (
  <div
    className={`animate-pulse rounded-lg bg-gray-200 dark:bg-neutral-800 ${className}`}
  />
);

const NavbarSkeleton = () => (
  <header className="fixed left-0 top-0 z-20 w-full">
    <nav className="container mx-auto flex items-center justify-between p-4 lg:px-8">
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="flex items-center gap-4">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-10" />
      </div>
    </nav>
  </header>
);

const FooterSkeleton = () => (
  <footer className="mx-auto mt-8 flex w-full max-w-2xl flex-wrap items-center justify-between gap-2 border-t border-dashed border-gray-100 pb-6 pt-4 dark:border-white/5">
    <Skeleton className="h-4 w-32" />
    <div className="flex items-center gap-2">
      <Skeleton className="h-5 w-5" />
      <Skeleton className="h-5 w-5" />
      <Skeleton className="h-5 w-5" />
      <div className="h-3 w-px bg-gray-100 dark:bg-white/10" />
      <Skeleton className="h-5 w-5" />
    </div>
  </footer>
);

export const Preloader = ({ isLoading }: { isLoading: boolean }) => {
  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 flex min-h-screen flex-col justify-between bg-white pt-20 dark:bg-neutral-900"
        >
          <NavbarSkeleton />
          <div className="mx-auto grid w-full max-w-md gap-6 py-10 text-sm">
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

            {/* Recipient Section */}
            {/* <div className="space-y-2 rounded-2xl bg-gray-50 p-2 dark:bg-neutral-800">
              <div className="space-y-4 rounded-2xl bg-white p-4 dark:bg-neutral-900">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-32" />
                </div>

                <div className="flex flex-row items-start gap-4">
                  <Skeleton className="h-10 w-48" />
                  <Skeleton className="h-10 flex-1" />
                </div>
              </div> */}

            {/* Memo Field */}
            {/* <div className="relative">
                <Skeleton className="h-10 w-full" />
              </div>
            </div> */}

            {/* Button */}
            <Skeleton className="h-11 w-full rounded-xl" />

            {/* Rate Info */}
            {/* <div className="flex w-full flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <Skeleton className="h-4 w-32" />
              <div className="ml-auto flex w-full flex-col justify-end gap-2 sm:flex-row sm:items-center">
                <div className="h-px w-1/2 flex-shrink bg-gradient-to-tr from-white to-gray-200 dark:from-neutral-900 dark:to-neutral-800 sm:w-full" />
                <Skeleton className="h-4 w-48" />
              </div>
            </div> */}
          </div>
          <FooterSkeleton />
        </motion.div>
      )}
    </AnimatePresence>
  );
};
