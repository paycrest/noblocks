"use client";

import {
  CheckmarkCircle01Icon,
  Loading03Icon,
} from "hugeicons-react";

import { classNames } from "@/app/utils";

import { ActionSubmitButton } from "./ActionSubmitButton";
import type { ActionProgressStep } from "./types";

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
  noteText = "You can leave this page. It stays in history as pending, and we will notify you when it lands.",
  secondaryActionLabel = "I have sent the money",
}: ActionProgressProps) {
  return (
    <div className="flex w-full flex-col gap-6">
      <div>
        <p className="text-base font-medium text-white/80">{heading}</p>
        <p className="text-sm text-white/50">{subheading}</p>
      </div>

      <div className="rounded-3xl bg-[#202020] p-5">
        <p className="mb-4 text-sm text-white/50">Now</p>
        <ol className="flex flex-col">
          {steps.map((step, index) => (
            <li key={step.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <StepIcon state={step.state} />
                {index < steps.length - 1 ? (
                  <span className="my-1 w-0.5 flex-1 min-h-[28px] rounded-full bg-white/10" />
                ) : null}
              </div>
              <p
                className={classNames(
                  "pb-6 text-sm",
                  step.state === "pending"
                    ? "text-white/50"
                    : step.state === "failed"
                      ? "text-[#f53d6b]"
                      : "text-white/80",
                )}
              >
                {step.label}
              </p>
            </li>
          ))}
        </ol>
      </div>

      <ActionSubmitButton
        label={secondaryActionLabel}
        disabled
        onClick={() => {}}
      />

      <p className="text-center text-sm text-white/50">{noteText}</p>
    </div>
  );
}

function StepIcon({ state }: { state: ActionProgressStep["state"] }) {
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
      <Loading03Icon
        className="size-5 shrink-0 animate-spin text-[#39c65d]"
        aria-hidden
      />
    );
  }
  return (
    <span
      className="size-5 shrink-0 rounded-full border-2 border-white/20"
      aria-hidden
    />
  );
}
