"use client";

import type { ReactNode } from "react";
import { CheckmarkCircle01Icon } from "hugeicons-react";

import type { ActionProgressStepState } from "./types";

function SpinnerTrack({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative size-5 shrink-0 text-border-light dark:text-white/20">
      {children}
    </span>
  );
}

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
      <SpinnerTrack>
        <svg
          viewBox="0 0 20 20"
          className="size-5 animate-spin"
          aria-hidden
        >
          <circle
            cx="10"
            cy="10"
            r="8"
            fill="none"
            stroke="currentColor"
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
      </SpinnerTrack>
    );
  }
  return (
    <span
      className="size-5 shrink-0 rounded-full border-2 border-border-light dark:border-white/20"
      aria-hidden
    />
  );
}
