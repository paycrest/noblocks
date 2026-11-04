"use client";

import { useEffect, useState } from "react";

/** Viewport below Tailwind `md` (768px) — mobile shell nav behavior. */
export function useIsBelowMd() {
  const [isBelowMd, setIsBelowMd] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 767px)").matches
      : false,
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsBelowMd(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isBelowMd;
}
