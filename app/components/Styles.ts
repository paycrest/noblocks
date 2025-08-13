export const baseBtnClasses =
  "text-sm min-w-fit leading-normal min-h-11 rounded-xl px-4 py-2.5 font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed dark:focus-visible:ring-offset-neutral-900 flex items-center justify-center";

export const primaryBtnClasses = `${baseBtnClasses} bg-lavender-500 text-white disabled:bg-gray-300 disabled:text-white dark:disabled:bg-white/10 dark:disabled:text-white/50 hover:bg-lavender-600 dark:hover:bg-lavender-600`;

export const secondaryBtnClasses = `${baseBtnClasses} bg-gray-50 text-neutral-900 dark:bg-neutral-800 dark:text-white disabled:cursor-not-allowed dark:bg-white/10 hover:bg-gray-100 dark:hover:bg-white/5`;

export const outlineBtnClasses = `${baseBtnClasses} border border-border-input text-text-body dark:border-white/20 dark:text-white hover:bg-lavender-500/10 dark:hover:bg-white/5`;

export const inputClasses =
  "w-full rounded-xl border border-border-input bg-transparent bg-white py-2 px-4 text-sm text-neutral-900 transition-all placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-lavender-500 focus:ring-opacity-50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-white/20 dark:bg-neutral-900 dark:text-white/80 dark:placeholder:text-white/30 dark:focus-visible:ring-offset-neutral-900 disabled:cursor-not-allowed";
