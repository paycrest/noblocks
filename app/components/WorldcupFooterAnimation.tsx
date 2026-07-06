"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LottieComponentProps, LottieRefCurrentProps } from "lottie-react";
import type { RocketStatus } from "../context/RocketStatusContext";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

const ANIMATION_SRC = "/images/animation/worldcup-footer.json";

/** Frame ranges derived from worldcup-footer.json layer motion (60 fps, op ≈ 484). */
const SEGMENTS = {
  /**
   * Leg juggle loop — frames 16–94 keep the ball in frame and end/start leg
   * poses close enough to hide the seam (skip intro + kick wind-up).
   */
  juggle: [16, 94] as [number, number],
  /** Kick → ball in the net (stop before cup zoom, which clears the scene). */
  goalScored: [133, 175] as [number, number],
} as const;

const SPEED_BY_STATUS: Record<RocketStatus, number> = {
  pending: 1,
  processing: 2.5,
  fulfilled: 3,
  settled: 1,
};

type LottieLayer = {
  ty?: number;
  ind?: number;
  shapes?: Array<{ ty?: string; s?: { k?: number[] } }>;
  layers?: LottieLayer[];
};

type PlaybackMode = "juggle" | "celebration";

/** Drop the full-comp solid rect so the page footer background shows through. */
function stripAnimationBackground<T extends { layers?: LottieLayer[] }>(
  data: T,
): T {
  const stripLayers = (layers: LottieLayer[] | undefined): LottieLayer[] =>
    (layers ?? []).filter((layer) => {
      if (layer.ty === 4 && layer.shapes?.length) {
        const rect = layer.shapes.find((shape) => shape.ty === "rc");
        const size = rect?.s?.k;
        const isFullCanvas =
          Array.isArray(size) && size[0] >= 1999 && size[1] >= 1099;
        const hasFill = layer.shapes.some((shape) => shape.ty === "fl");
        if (isFullCanvas && hasFill) return false;
      }
      if (layer.layers) {
        layer.layers = stripLayers(layer.layers);
      }
      return true;
    });

  return { ...data, layers: stripLayers(data.layers) };
}

function applyPlayback(
  lottie: LottieRefCurrentProps,
  mode: PlaybackMode,
  rocketStatus: RocketStatus,
) {
  if (mode === "celebration") {
    lottie.setSpeed(SPEED_BY_STATUS.settled);
    lottie.playSegments(SEGMENTS.goalScored, true);
    return;
  }

  lottie.setSpeed(SPEED_BY_STATUS[rocketStatus]);
  lottie.playSegments(SEGMENTS.juggle, true);
}

function freezeGoalScoredFrame(lottie: LottieRefCurrentProps) {
  lottie.setSpeed(1);
  lottie.goToAndStop(SEGMENTS.goalScored[1], true);
}

type WorldcupFooterAnimationProps = {
  rocketStatus: RocketStatus;
};

export function WorldcupFooterAnimation({
  rocketStatus,
}: WorldcupFooterAnimationProps) {
  const lottieRef = useRef<LottieRefCurrentProps>(null);
  const goalScoredFrozenRef = useRef(false);
  const prevPlaybackModeRef = useRef<PlaybackMode | null>(null);
  const prevReduceMotionRef = useRef(false);
  const [animationData, setAnimationData] =
    useState<LottieComponentProps["animationData"]>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [animationReady, setAnimationReady] = useState(false);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>("juggle");

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mediaQuery.matches);
    sync();
    mediaQuery.addEventListener("change", sync);
    return () => mediaQuery.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    let active = true;
    fetch(ANIMATION_SRC)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data) => {
        if (active) setAnimationData(stripAnimationBackground(data));
      })
      .catch(() => {
        /* decorative */
      });
    return () => {
      active = false;
    };
  }, []);

  // Settled → play goal once and hold; other statuses → juggle loop.
  useEffect(() => {
    if (rocketStatus === "settled") {
      setPlaybackMode("celebration");
    } else {
      goalScoredFrozenRef.current = false;
      setPlaybackMode("juggle");
    }
  }, [rocketStatus]);

  useEffect(() => {
    if (!animationReady || !lottieRef.current) return;
    if (reduceMotion) {
      lottieRef.current.goToAndStop(SEGMENTS.juggle[0], true);
      prevReduceMotionRef.current = true;
      return;
    }
    if (playbackMode === "celebration" && goalScoredFrozenRef.current) {
      freezeGoalScoredFrame(lottieRef.current);
      return;
    }

    const modeChanged = prevPlaybackModeRef.current !== playbackMode;
    const resumedFromReduceMotion = prevReduceMotionRef.current;

    if (modeChanged || resumedFromReduceMotion) {
      applyPlayback(lottieRef.current, playbackMode, rocketStatus);
      prevPlaybackModeRef.current = playbackMode;
    } else if (playbackMode === "juggle") {
      lottieRef.current.setSpeed(SPEED_BY_STATUS[rocketStatus]);
    }

    prevReduceMotionRef.current = false;
  }, [animationReady, playbackMode, rocketStatus, reduceMotion]);

  const handleComplete = useCallback(() => {
    if (playbackMode === "celebration" && lottieRef.current) {
      goalScoredFrozenRef.current = true;
      freezeGoalScoredFrame(lottieRef.current);
    }
  }, [playbackMode]);

  if (!animationData) return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] overflow-hidden md:left-auto md:right-0 md:max-h-[700px] md:w-[min(1000px,100%)]"
      aria-hidden
    >
      <Lottie
        lottieRef={lottieRef}
        animationData={animationData}
        loop={playbackMode === "juggle" && !reduceMotion}
        autoplay={false}
        onDOMLoaded={() => setAnimationReady(true)}
        onComplete={handleComplete}
        onLoopComplete={() => {
          // Re-anchor the juggle segment so lottie-web doesn't snap to frame 0.
          if (
            playbackMode === "juggle" &&
            !reduceMotion &&
            lottieRef.current
          ) {
            lottieRef.current.playSegments(SEGMENTS.juggle, true);
          }
        }}
        className="h-auto w-full"
        rendererSettings={{ preserveAspectRatio: "xMaxYMax meet" }}
      />
    </div>
  );
}
