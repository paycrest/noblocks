"use client";

import { useSyncExternalStore } from "react";

/** Tailwind's default `md` breakpoint (not overridden in tailwind.config.ts). */
export const TAILWIND_MD_MIN_WIDTH = "768px";

/**
 * Viewport below Tailwind `md` — mobile shell nav behavior. This is exactly the
 * query Tailwind v3 emits for `max-md:`, so the hook and the CSS always agree,
 * including at fractional widths such as 767.5px.
 */
export const BELOW_MD_QUERY = `not all and (min-width: ${TAILWIND_MD_MIN_WIDTH})`;

function subscribe(onChange: () => void) {
  const media = window.matchMedia(BELOW_MD_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getSnapshot() {
  return window.matchMedia(BELOW_MD_QUERY).matches;
}

/** Server render (and hydration) always assumes desktop to avoid a mismatch. */
function getServerSnapshot() {
  return false;
}

export function useIsBelowMd() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
