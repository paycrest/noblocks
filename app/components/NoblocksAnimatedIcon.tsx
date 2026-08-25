"use client";

import { useEffect, useState } from "react";
import { NoblocksLogoIcon } from "./ImageAssets";

/**
 * Mobile brand icon that hard-cuts through a loop of states, by default:
 *   0. the default Noblocks "n" icon
 *   1. a spinning soccer ball
 *   2. the World Cup trophy (legacy), or the Premier League lion watermark
 * The `phases` prop picks which states to include (see below) — e.g. a spot
 * that shouldn't show the Noblocks brand mark can cycle just ball → lion.
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
const LION_SRC = "/images/play-promo/pl-lion-watermark.svg";

// Module-scope cache so the markup is fetched/parsed once across remounts.
const cache: Record<string, string> = {};

/** Strip the root <svg> width/height so the wrapper's CSS controls sizing. */
const stripSize = (svg: string) =>
  svg.replace(/^<svg[^>]*>/, (tag) =>
    tag.replace(/\swidth="[^"]*"/, "").replace(/\sheight="[^"]*"/, ""),
  );

type Phase = "logo" | "ball" | "trophy" | "lion";
const DEFAULT_PHASES: Phase[] = ["logo", "ball", "trophy"];

export const NoblocksAnimatedIcon = ({
  className = "",
  phases = DEFAULT_PHASES,
}: {
  className?: string;
  /** States to cycle through, in order. Defaults to the full
   * logo → ball → trophy loop; pass e.g. `["ball", "lion"]` for Play promo. */
  phases?: Phase[];
}) => {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [ball, setBall] = useState<string | null>(cache[BALL_SRC] ?? null);
  const [trophy, setTrophy] = useState<string | null>(cache[TROPHY_SRC] ?? null);
  const [lion, setLion] = useState<string | null>(cache[LION_SRC] ?? null);

  // Prefetch assets up front so cycling never flashes a blank frame.
  useEffect(() => {
    let active = true;
    const load = (src: string, set: (v: string) => void) => {
      // Hydrate from the cache rather than bailing: this instance may have
      // rendered (seeding null) before another instance's fetch filled it,
      // and without the setter it would show the fallback forever.
      if (cache[src]) {
        set(cache[src]);
        return;
      }
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
    if (phases.includes("ball")) load(BALL_SRC, setBall);
    if (phases.includes("trophy")) load(TROPHY_SRC, setTrophy);
    if (phases.includes("lion")) load(LION_SRC, setLion);
    return () => {
      active = false;
    };
  }, [phases.join(",")]);

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
            className="flex size-full items-center justify-center [&>svg]:h-[71.11%] [&>svg]:w-auto [&>svg]:shrink-0 [&>svg]:scale-150"
            dangerouslySetInnerHTML={{ __html: trophy }}
          />
        ) : (
          fallback
        ))}
      {current === "lion" &&
        (lion ? (
          <span
            className="flex size-full items-center justify-center [&>svg]:size-full"
            dangerouslySetInnerHTML={{ __html: lion }}
          />
        ) : (
          fallback
        ))}
    </span>
  );
};
