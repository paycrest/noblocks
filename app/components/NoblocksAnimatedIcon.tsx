"use client";

import { useEffect, useState } from "react";
import { NoblocksLogoIcon } from "./ImageAssets";

/**
 * Mobile brand icon that hard-cuts through a loop of states, by default:
 *   0. the default Noblocks "n" icon
 *   1. a spinning soccer ball
 *   2. the World Cup trophy
 * The `phases` prop picks which states to include (see below) — e.g. a spot
 * that shouldn't show the Noblocks brand mark can cycle just ball → trophy.
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

const BALL_SRC = "/logos/worldcup/ball.svg?v=1";
const TROPHY_SRC = "/logos/worldcup/trophy.svg?v=1";

// Module-scope cache so the markup is fetched/parsed once across remounts.
const cache: Record<string, string> = {};

/** Strip the root <svg> width/height so the wrapper's CSS controls sizing. */
const stripSize = (svg: string) =>
  svg.replace(/^<svg[^>]*>/, (tag) =>
    tag.replace(/\swidth="[^"]*"/, "").replace(/\sheight="[^"]*"/, ""),
  );

type Phase = "logo" | "ball" | "trophy";
const DEFAULT_PHASES: Phase[] = ["logo", "ball", "trophy"];

export const NoblocksAnimatedIcon = ({
  className = "",
  phases = DEFAULT_PHASES,
}: {
  className?: string;
  /** States to cycle through, in order. Defaults to the full
   * logo → ball → trophy loop; pass e.g. `["ball", "trophy"]` to skip the
   * Noblocks "n" (for spots where our own brand mark isn't appropriate). */
  phases?: Phase[];
}) => {
  const [phaseIndex, setPhaseIndex] = useState(0);
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

  // Drive the loop, staying reactive to runtime changes of the user's motion
  // preference (WCAG 2.3.3): if reduced motion is turned on mid-session we stop
  // and reset to the static "n"; if turned off, we resume cycling.
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let id: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (!mediaQuery.matches && id === null) {
        id = setInterval(() => setPhaseIndex((p) => (p + 1) % phases.length), PHASE_MS);
      }
    };

    const stop = () => {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
      setPhaseIndex(0);
    };

    const handleChange = () => (mediaQuery.matches ? stop() : start());

    mediaQuery.addEventListener("change", handleChange);
    start();

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
      if (id !== null) clearInterval(id);
    };
  }, [phases.length]);

  const fallback = <NoblocksLogoIcon className="size-full" />;
  const current = phases[phaseIndex];

  return (
    <span aria-hidden className={`block ${className}`}>
      {current === "logo" && fallback}
      {current === "ball" &&
        (ball ? (
          <span
            className="nb-icon-spin block size-full [&>svg]:size-full"
            dangerouslySetInnerHTML={{ __html: ball }}
          />
        ) : (
          fallback
        ))}
      {current === "trophy" &&
        (trophy ? (
          <span
            // Trophy renders ~11% taller than the box (matches its natural
            // aspect overflowing evenly, centered) — relative so it scales
            // correctly at any container size, not just the 18px nav icon.
            className="flex size-full items-center justify-center [&>svg]:h-[71.11%] [&>svg]:w-auto"
            dangerouslySetInnerHTML={{ __html: trophy }}
          />
        ) : (
          fallback
        ))}
    </span>
  );
};
