"use client";

import { useEffect, useState } from "react";

/**
 * World Cup Noblocks wordmark, rendered as INLINE SVG.
 *
 * Why inline (and not <img>/<object>): the SVG carries its own CSS keyframe
 * animation that spins the two soccer-ball "O"s. CSS animations inside an
 * <img>-embedded SVG do NOT run in Safari/iOS (WebKit), and <object> fails to
 * size correctly here. Injecting the markup into the live DOM makes the spin
 * (and its `prefers-reduced-motion` opt-out) work in every browser.
 *
 * The ~900KB artwork stays a cached static file fetched once at runtime, so it
 * never lands in the JS bundle. The result is memoised at module scope so it is
 * fetched/parsed a single time across remounts.
 */
let cachedMarkup: string | null = null;

export const NoblocksWorldCupLogo = ({
  className = "",
}: {
  className?: string;
}) => {
  const [svg, setSvg] = useState<string | null>(cachedMarkup);

  useEffect(() => {
    if (svg) return;
    let active = true;
    fetch("/logos/noblocks-worldcup-logo.svg?v=spin")
      .then((res) => (res.ok ? res.text() : Promise.reject(res.status)))
      .then((markup) => {
        // Drop the fixed width/height on the root <svg> so the viewBox + CSS
        // control sizing (the wrapper reserves the correct aspect ratio).
        cachedMarkup = markup.replace(/^<svg[^>]*>/, (tag) =>
          tag.replace(/\swidth="[^"]*"/, "").replace(/\sheight="[^"]*"/, ""),
        );
        if (active) setSvg(cachedMarkup);
      })
      .catch(() => {
        // Logo is decorative; the wrapping button already has an aria-label.
      });
    return () => {
      active = false;
    };
  }, [svg]);

  return (
    <span
      aria-hidden
      // aspect-[414/62] reserves space pre-load (no layout shift); the injected
      // svg fills it. block keeps it from adding inline-baseline whitespace.
      className={`block aspect-[414/62] w-[120px] [&>svg]:h-full [&>svg]:w-full ${className}`}
      {...(svg ? { dangerouslySetInnerHTML: { __html: svg } } : {})}
    />
  );
};
