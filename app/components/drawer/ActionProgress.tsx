"use client";

import { classNames } from "@/app/utils";

import { ActionSubmitButton } from "./ActionSubmitButton";
import { drawerBorderLight } from "./drawerStyles";
import { ProgressStepIcon } from "./ProgressStepIcon";
import type { ActionProgressStep } from "./types";

const DEFAULT_NOTE =
  "You can leave this page. It stays in history as pending, and we will notify you when it lands";

const DEFAULT_SECONDARY_LABEL = "I have sent the money";

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
  noteText = DEFAULT_NOTE,
  secondaryActionLabel = DEFAULT_SECONDARY_LABEL,
}: ActionProgressProps) {
  return (
    <div className="flex w-full flex-col gap-6">
      <div>
        <p className="text-base font-medium text-white/80">{heading}</p>
        <p className="text-sm text-white/50">{subheading}</p>
      </div>

      <div className={classNames("rounded-3xl bg-[#202020] p-5", drawerBorderLight)}>
        <p className="mb-4 text-sm text-white/50">Now</p>
        <ol className="flex flex-col">
          {steps.map((step, index) => (
            <li key={step.id} className="flex gap-6">
              <div className="flex flex-col items-center">
                <ProgressStepIcon state={step.state} />
                {index < steps.length - 1 ? (
                  <span className="my-0.5 w-1 min-h-[34px] rounded-full bg-white/10" />
                ) : null}
              </div>
              <p className="pb-6 text-sm text-white/50">{step.label}</p>
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
