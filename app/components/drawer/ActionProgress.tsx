"use client";

import { useEffect, useMemo, useRef } from "react";

import { classNames } from "@/app/utils";

import { ActionSubmitButton } from "./ActionSubmitButton";
import {
  drawerBorderLight,
  drawerProgressCardClasses,
  drawerProgressConnectorClasses,
  drawerSecondaryText,
  drawerStepHeadingClasses,
} from "./drawerStyles";
import { ProgressStepIcon } from "./ProgressStepIcon";
import type { ActionProgressStep } from "./types";

const DEFAULT_NOTE =
  "You can leave this page. It stays in history as pending, and we will notify you when it lands";

const DEFAULT_SECONDARY_LABEL = "I have sent the money";

function stepAnnouncement(steps: ActionProgressStep[]): string {
  const active = steps.find((s) => s.state === "active");
  if (active) {
    return `Now: ${active.label}`;
  }
  const failed = steps.find((s) => s.state === "failed");
  if (failed) {
    return `Step failed: ${failed.label}`;
  }
  const lastDone = [...steps].reverse().find((s) => s.state === "done");
  if (lastDone) {
    return `Completed: ${lastDone.label}`;
  }
  return "";
}

export type ActionProgressProps = {
  heading: string;
  subheading: string;
  steps: ActionProgressStep[];
  noteText?: string;
  secondaryActionLabel?: string;
};

export function ActionProgress({
  heading,
  subheading,
  steps,
  noteText,
  secondaryActionLabel,
}: ActionProgressProps) {
  const liveRef = useRef<HTMLDivElement>(null);
  const announcement = useMemo(() => stepAnnouncement(steps), [steps]);
  const hasFailedStep = steps.some((step) => step.state === "failed");
  const showSecondaryButton =
    !hasFailedStep || secondaryActionLabel !== undefined;
  const showNote = !hasFailedStep || noteText !== undefined;
  const resolvedSecondaryLabel =
    secondaryActionLabel ?? DEFAULT_SECONDARY_LABEL;
  const resolvedNote = noteText ?? DEFAULT_NOTE;

  useEffect(() => {
    if (!announcement || !liveRef.current) {
      return;
    }
    liveRef.current.textContent = announcement;
  }, [announcement]);

  return (
    <div className="flex w-full flex-col gap-6">
      <div
        ref={liveRef}
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />

      <div>
        <p className={drawerStepHeadingClasses}>{heading}</p>
        <p className={drawerSecondaryText}>{subheading}</p>
      </div>

      <div
        className={classNames(
          "rounded-3xl p-5",
          drawerProgressCardClasses,
          drawerBorderLight,
        )}
      >
        <p className={classNames("mb-4", drawerSecondaryText)}>Now</p>
        <ol className="flex flex-col">
          {steps.map((step, index) => (
            <li
              key={step.id}
              className="flex gap-6"
              aria-current={step.state === "active" ? "step" : undefined}
            >
              <div className="flex flex-col items-center">
                <ProgressStepIcon state={step.state} />
                {index < steps.length - 1 ? (
                  <span className={drawerProgressConnectorClasses} />
                ) : null}
              </div>
              <p className={classNames("pb-6", drawerSecondaryText)}>
                {step.label}
              </p>
            </li>
          ))}
        </ol>
      </div>

      {showSecondaryButton ? (
        <ActionSubmitButton
          label={resolvedSecondaryLabel}
          disabled
          onClick={() => {}}
        />
      ) : null}

      {showNote ? (
        <p className={classNames("text-center", drawerSecondaryText)}>
          {resolvedNote}
        </p>
      ) : null}
    </div>
  );
}
