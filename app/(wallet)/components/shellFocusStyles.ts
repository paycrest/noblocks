/** Lavender focus ring aligned with primary buttons (`Styles.ts`, drawer CTAs). */
export const shellFocusRingClasses =
  "outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-surface-canvas";

/** Expands a visually smaller control to a centred 44×44px hit target (WCAG 2.5.5). */
export const shellMinHitTargetClasses =
  "relative before:absolute before:left-1/2 before:top-1/2 before:z-0 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] [&>*:not(.sr-only)]:relative [&>*:not(.sr-only)]:z-[1]";
