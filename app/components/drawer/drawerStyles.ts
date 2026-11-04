/** Shared drawer theming: Figma light defaults, Superdark via `dark:`. */

export const drawerShellClasses =
  "bg-background-neutral dark:bg-[#2b2b2b]";

export const drawerCanvasClasses = "bg-white dark:bg-[#141414]";

export const drawerOverlaySurfaceClasses =
  "bg-white dark:bg-[#202020]";

export const drawerBorderLight =
  "border-[0.5px] border-border-light dark:border-white/10";

export const drawerBorderNeutral =
  "border-[0.5px] border-[#e3e3e9] dark:border-white/50";

/** Drawer header: Inter Semibold 18 / 36, text/primary */
export const drawerHeaderTitleClasses =
  "font-semibold text-lg leading-9 tracking-[-0.54px] text-black dark:text-white";

/** Step headings: Inter Medium 16 / 28, text/body */
export const drawerStepHeadingClasses =
  "text-base font-medium leading-7 text-text-body dark:text-white/80";

/** Review modal title: General Sans Semibold 14 / 28, text/primary */
export const drawerModalTitleClasses =
  "text-sm font-semibold leading-7 text-black dark:text-white";

/** Receipt titles: Medium 20 / 28, text/body */
export const drawerReceiptTitleClasses =
  "text-xl font-medium leading-7 text-text-body dark:text-white/80";

export const drawerSecondaryText =
  "font-normal text-sm leading-5 text-text-secondary dark:text-white/50";

export const drawerBodyText =
  "text-sm leading-5 text-text-body dark:text-white/80";

export const drawerBodyMediumText =
  "text-sm font-medium leading-5 text-text-body dark:text-white/80";

/** Emphasised inline amounts: primary text in light, white in dark. */
export const drawerEmphasisText =
  "font-medium text-neutral-900 dark:text-white";

export const drawerDetailCardInnerClasses =
  "overflow-hidden rounded-xl bg-white border-[0.5px] border-border-light dark:bg-[#141414] dark:border-white/10";

export const drawerPrimaryButtonClasses =
  "flex min-h-11 w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#2b2b2b] bg-lavender-500 hover:bg-lavender-600 disabled:cursor-not-allowed disabled:bg-border-input disabled:text-white dark:disabled:bg-[#2e2e2e] dark:disabled:text-white/50 disabled:hover:bg-border-input dark:disabled:hover:bg-[#2e2e2e]";

export const drawerSecondaryButtonClasses =
  "flex min-h-11 w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#2b2b2b] bg-accent-gray text-neutral-900 hover:bg-gray-100 dark:bg-white/10 dark:text-white dark:hover:bg-white/15 disabled:cursor-not-allowed disabled:bg-border-input disabled:text-white dark:disabled:bg-[#2e2e2e] dark:disabled:text-white/50";

export const drawerPillPrimaryButtonClasses =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-lavender-500 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-lavender-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500 disabled:cursor-not-allowed disabled:bg-border-input disabled:text-white dark:disabled:bg-[#2e2e2e] dark:disabled:text-white/50 [&>span]:inline-flex [&>span]:h-8 [&>span]:items-center";

export const drawerModalShellClasses =
  "!rounded-t-[30px] sm:!rounded-[32px] !border !border-border-light !bg-white !p-5 !shadow-2xl dark:!border-white/10 dark:!bg-[#2b2b2b]";

export const drawerDividerClasses =
  "border-border-light dark:border-white/10";

export const drawerDashedDividerClasses =
  "border-dashed border-border-light dark:border-white/10";

export const drawerNeutralCardClasses =
  "bg-background-neutral dark:bg-white/[0.05]";

export const drawerIconMutedClasses =
  "text-icon-outline-secondary hover:text-lavender-500 dark:text-white/50 dark:hover:text-lavender-500";

export const drawerCloseButtonClasses =
  "relative inline-flex items-center justify-center text-icon-outline-secondary transition-colors hover:text-text-body outline-none focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-lavender-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-white/50 dark:hover:text-white dark:focus-visible:ring-offset-[#2b2b2b] before:absolute before:inset-0 before:-m-[10px] before:min-h-11 before:min-w-11";

export const drawerCopyButtonClasses =
  "relative mt-1 inline-flex shrink-0 items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500 before:absolute before:inset-0 before:-m-[14px] before:min-h-11 before:min-w-11";

export const drawerSuccessIconClasses =
  "text-[#227738] dark:text-[#39c65d]";

export const drawerFailedStatusClasses =
  "text-accent-red dark:text-[#f76489]";

export const drawerProgressConnectorClasses =
  "my-0.5 w-[3px] min-h-[33px] rounded-full bg-[#e3e3e9] dark:bg-white/50";
