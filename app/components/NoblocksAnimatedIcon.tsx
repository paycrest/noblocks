"use client";

import { useEffect, useState } from "react";
import { NoblocksLogoIcon } from "./ImageAssets";

/**
 * Mobile brand icon that hard-cuts through three states on a loop:
 *   0. the default Noblocks "n" icon
 *   1. a spinning soccer ball
 *   2. the World Cup trophy
 *
 * Each state is held for ~2s with an instant swap (no cross-fade), inside a
 * fixed bounding box so surrounding UI never shifts.
 *
 * Cross-browser strategy: the ball/trophy SVGs are fetched once and injected
 * INLINE into the DOM (so they render identically everywhere, incl. Safari/iOS),
 * and the spin is applied to the live wrapper element — not as a CSS animation
 * inside the SVG, which WebKit ignores for <img>-embedded SVGs. The ~330KB ball
 * artwork stays a cached static file, out of the JS bundle.
 *
 * Respects `prefers-reduced-motion`: the loop and the spin are both disabled, so
 * reduced-motion users simply see the static "n".
 */
const PHASE_MS = 2000;
const PHASES = 3;

const BALL_SRC = "/logos/worldcup/ball.svg?v=1";
const TROPHY_SRC = "/logos/worldcup/trophy.svg?v=1";

// Module-scope cache so the markup is fetched/parsed once across remounts.
const cache: Record<string, string> = {};

/** Strip the root <svg> width/height so the wrapper's CSS controls sizing. */
const stripSize = (svg: string) =>
  svg.replace(/^<svg[^>]*>/, (tag) =>
    tag.replace(/\swidth="[^"]*"/, "").replace(/\sheight="[^"]*"/, ""),
  );

export const NoblocksAnimatedIcon = ({
  className = "",
}: {
  className?: string;
}) => {
  const [phase, setPhase] = useState(0);
  const [ball, setBall] = useState<string | null>(cache[BALL_SRC] ?? null);
  const [trophy, setTrophy] = useState<string | null>(cache[TROPHY_SRC] ?? null);

  // Prefetch both assets up front so cycling never flashes a blank frame.
  useEffect(() => {
    let active = true;
    const load = (src: string, set: (v: string) => void) => {
      if (cache[src]) return;
      fetch(src)
        .then((res) => (res.ok ? res.text() : Promise.reject(res.status)))
        .then((markup) => {
          cache[src] = stripSize(markup);
          if (active) set(cache[src]);
        })
        .catch(() => {
          /* decorative; the wrapping button already carries an aria-label */
        });
    };
    load(BALL_SRC, setBall);
    load(TROPHY_SRC, setTrophy);
    return () => {
      active = false;
    };
  }, []);

  // Drive the loop (skipped entirely under reduced motion).
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setPhase((p) => (p + 1) % PHASES), PHASE_MS);
    return () => clearInterval(id);
  }, []);

  const fallback = <NoblocksLogoIcon className="size-full" />;

  return (
    <span aria-hidden className={`block ${className}`}>
      {phase === 0 && fallback}
      {phase === 1 &&
        (ball ? (
          <span
            className="nb-icon-spin block size-full [&>svg]:size-full"
            dangerouslySetInnerHTML={{ __html: ball }}
          />
        ) : (
          fallback
        ))}
      {phase === 2 &&
        (trophy ? (
          <span
            className="flex size-full items-center justify-center [&>svg]:h-full [&>svg]:w-auto"
            dangerouslySetInnerHTML={{ __html: trophy }}
          />
        ) : (
          fallback
        ))}
    </span>
  );
};
