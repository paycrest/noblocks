"use client";

import { CheckmarkCircle01Icon } from "hugeicons-react";

import type { ActionProgressStepState } from "./types";

export function ProgressStepIcon({ state }: { state: ActionProgressStepState }) {
  if (state === "done") {
    return (
      <CheckmarkCircle01Icon
        className="size-5 shrink-0 text-[#39c65d]"
        aria-hidden
      />
    );
  }
  if (state === "failed") {
    return (
      <span
        className="size-5 shrink-0 rounded-full border-2 border-[#f53d6b]"
        aria-hidden
      />
    );
  }
  if (state === "active") {
    return (
      <span
        className="relative size-5 shrink-0 animate-spin"
        aria-hidden
      >
        <svg viewBox="0 0 20 20" className="size-5">
          <circle
            cx="10"
            cy="10"
            r="8"
            fill="none"
            stroke="rgba(255,255,255,0.2)"
            strokeWidth="2"
          />
          <circle
            cx="10"
            cy="10"
            r="8"
            fill="none"
            stroke="#39c65d"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="14 36"
          />
        </svg>
      </span>
    );
  }
  return (
    <span
      className="size-5 shrink-0 rounded-full border-2 border-white/20"
      aria-hidden
    />
  );
}
