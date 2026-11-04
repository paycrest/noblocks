"use client";

import { useReducedMotion } from "framer-motion";
import { CheckmarkCircle01Icon } from "hugeicons-react";

import { classNames } from "@/app/utils";

import { drawerSuccessIconClasses } from "./drawerStyles";
import type { ActionProgressStepState } from "./types";

export function ProgressStepIcon({ state }: { state: ActionProgressStepState }) {
  const reduceMotion = useReducedMotion();

  if (state === "done") {
    return (
      <CheckmarkCircle01Icon
        className={classNames("size-5 shrink-0", drawerSuccessIconClasses)}
        aria-hidden
      />
    );
  }
  if (state === "failed") {
    return (
      <span
        className="size-5 shrink-0 rounded-full border-2 border-accent-red dark:border-[#f76489]"
        aria-hidden
      />
    );
  }
  if (state === "active") {
    return (
      <span
        className={classNames(
          "relative size-5 shrink-0",
          !reduceMotion && "animate-spin",
          "motion-reduce:animate-none",
        )}
        role="img"
        aria-label="In progress"
      >
        <svg viewBox="0 0 20 20" className="size-5">
          <circle
            cx="10"
            cy="10"
            r="8"
            fill="none"
            stroke="#ebebef"
            className="dark:stroke-white/20"
            strokeWidth="2"
          />
          <circle
            cx="10"
            cy="10"
            r="8"
            fill="none"
            stroke="#227738"
            className="dark:stroke-[#39c65d]"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="14 36"
          />
        </svg>
      </span>
    );
  }
  return (
    <span className="size-5 shrink-0" aria-hidden>
      <svg viewBox="0 0 20 20" className="size-5">
        <circle
          cx="10"
          cy="10"
          r="8"
          fill="none"
          stroke="#ebebef"
          className="dark:stroke-white/20"
          strokeWidth="2"
        />
      </svg>
    </span>
  );
}
