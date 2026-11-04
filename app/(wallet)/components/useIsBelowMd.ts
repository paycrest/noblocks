"use client";

import { useSyncExternalStore } from "react";

/** Viewport below Tailwind `md` (768px) — mobile shell nav behavior. */
const BELOW_MD_QUERY = "(max-width: 767px)";

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
