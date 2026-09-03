"use client";

/**
 * FPL-style stylized kit + club code badge. Drawn as SVG from hex colors —
 * no official crest or kit artwork files.
 */

import type { ReactNode } from "react";
import type { Position } from "./types";
import {
  contrastingInk,
  kitForPosition,
  type KitPattern,
} from "@/app/lib/fantasy/club-kits";

function patternFill(
  id: string,
  pattern: KitPattern,
  primary: string,
  secondary: string,
): { fill: string; defs: ReactNode } {
  switch (pattern) {
    case "stripes":
      return {
        fill: `url(#${id}-stripes)`,
        defs: (
          <pattern
            id={`${id}-stripes`}
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
          >
            <rect width="4" height="8" fill={primary} />
            <rect x="4" width="4" height="8" fill={secondary} />
          </pattern>
        ),
      };
    case "hoops":
      return {
        fill: `url(#${id}-hoops)`,
        defs: (
          <pattern
            id={`${id}-hoops`}
            width="10"
            height="8"
            patternUnits="userSpaceOnUse"
          >
            <rect width="10" height="4" fill={primary} />
            <rect y="4" width="10" height="4" fill={secondary} />
          </pattern>
        ),
      };
    case "halves":
      return {
        fill: `url(#${id}-halves)`,
        defs: (
          <linearGradient id={`${id}-halves`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="50%" stopColor={primary} />
            <stop offset="50%" stopColor={secondary} />
          </linearGradient>
        ),
      };
    case "sleeves":
      return { fill: primary, defs: null };
    default:
      return { fill: primary, defs: null };
  }
}

/**
 * Flat short-sleeve kit: sleeves sit level with the shoulders (FPL-like),
 * not drooping diagonals. Chest code sits on a solid plate so stripes stay readable.
 */
export const ClubJersey = ({
  teamId,
  position,
  className = "size-10",
  title,
}: {
  teamId: number;
  position?: Position | string;
  className?: string;
  title?: string;
}) => {
  const kit = kitForPosition(teamId, position);
  const uid = `kit-${teamId}-${position ?? "x"}-${kit.pattern}`;
  const { fill, defs } = patternFill(
    uid,
    kit.pattern,
    kit.primary,
    kit.secondary,
  );
  const sleeveFill = kit.pattern === "sleeves" ? kit.accent : kit.primary;
  const plate = kit.primary;
  const ink = kit.ink;
  const outline =
    contrastingInk(kit.primary) === "#ffffff" ? "rgba(0,0,0,0.22)" : "rgba(15,23,42,0.18)";

  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label={title ?? `${kit.code} kit`}
    >
      <defs>{defs}</defs>

      {/* Left sleeve — horizontal, slight taper */}
      <path
        d="M6 20 C6 18, 8 17, 12 17 L20 17 L20 31 L10 31 C7 31, 6 29, 6 26 Z"
        fill={sleeveFill}
        stroke={outline}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      {/* Right sleeve */}
      <path
        d="M58 20 C58 18, 56 17, 52 17 L44 17 L44 31 L54 31 C57 31, 58 29, 58 26 Z"
        fill={sleeveFill}
        stroke={outline}
        strokeWidth="1"
        strokeLinejoin="round"
      />

      {/* Body */}
      <path
        d="M20 16 C24 11, 28 9, 32 9 C36 9, 40 11, 44 16 L44 54 C44 56.5, 40 58, 32 58 C24 58, 20 56.5, 20 54 Z"
        fill={fill}
        stroke={outline}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />

      {/* Collar / neck hole */}
      <path
        d="M26 11 C28 15.5, 36 15.5, 38 11"
        fill="none"
        stroke={kit.secondary === kit.primary ? outline : kit.secondary}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <ellipse cx="32" cy="12" rx="5.5" ry="3.2" fill="rgba(0,0,0,0.12)" />

      {/* Solid chest plate so codes stay legible on stripes */}
      <rect
        x="20"
        y="28"
        width="24"
        height="12"
        rx="3"
        fill={plate}
        opacity={kit.pattern === "stripes" || kit.pattern === "hoops" ? 0.95 : 0.88}
      />
      <text
        x="32"
        y="34.5"
        textAnchor="middle"
        dominantBaseline="central"
        fill={ink}
        fontSize="9"
        fontWeight="800"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        letterSpacing="0.04em"
      >
        {kit.code.slice(0, 3)}
      </text>
    </svg>
  );
};

/**
 * Club mark workaround: colored chip + abbreviation (not an official crest).
 */
export const ClubBadge = ({
  teamId,
  className = "size-8",
  title,
}: {
  teamId: number;
  className?: string;
  title?: string;
}) => {
  const kit = kitForPosition(teamId, undefined);
  const ink = contrastingInk(kit.primary);
  return (
    <span
      title={title ?? kit.code}
      aria-label={title ?? kit.code}
      className={`inline-flex shrink-0 items-center justify-center rounded-lg text-[10px] font-extrabold leading-none tracking-wide shadow-sm ${className}`}
      style={{
        backgroundColor: kit.primary,
        color: ink,
        boxShadow: `inset 0 0 0 1px ${ink === "#ffffff" ? "rgba(255,255,255,0.25)" : "rgba(15,23,42,0.15)"}`,
      }}
    >
      {kit.code}
    </span>
  );
};
