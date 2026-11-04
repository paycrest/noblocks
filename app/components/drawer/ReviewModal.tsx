"use client";

import type { ReactNode } from "react";
import { ArrowDown02Icon, Cancel01Icon, InformationSquareIcon } from "hugeicons-react";

import { AnimatedModal } from "@/app/components/AnimatedComponents";
import { classNames } from "@/app/utils";

import { ActionSubmitButton } from "./ActionSubmitButton";
import { drawerBorderLight } from "./drawerStyles";
import { ReviewSummaryRow } from "./ReviewShared";

export type ReviewModalTokenPill = {
  symbol: string;
  amountLabel: string;
  icon?: ReactNode;
};

export type ReviewModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  from: ReviewModalTokenPill;
  to: ReviewModalTokenPill;
  youPayLabel: string;
  youPayIcon?: ReactNode;
  feesLabel: string;
  warningText: string;
  submitLabel?: string;
  submitDisabled?: boolean;
  isSubmitting?: boolean;
  onSubmit: () => void;
};

export function ReviewModal({
  isOpen,
  onClose,
  title = "Review swap",
  from,
  to,
  youPayLabel,
  youPayIcon,
  feesLabel,
  warningText,
  submitLabel = "Swap",
  submitDisabled,
  isSubmitting,
  onSubmit,
}: ReviewModalProps) {
  return (
    <AnimatedModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="24.125rem"
      dialogPanelClassName="!bg-transparent !shadow-none"
      contentClassName="!rounded-[32px] !border !border-white/10 !bg-[#2b2b2b] !p-5 !shadow-2xl dark:!bg-[#2b2b2b]"
    >
      <div className="flex flex-col gap-7">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-semibold text-white/80">{title}</p>
          <button
            type="button"
            aria-label="Close"
            className="text-white/50 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500"
            onClick={onClose}
          >
            <Cancel01Icon className="size-5" />
          </button>
        </div>

        <div className="flex items-center justify-center gap-2.5">
          <TokenPill {...from} />
          <ArrowDown02Icon className="size-4 -rotate-90 text-white/50" />
          <TokenPill {...to} />
        </div>

        <div className="flex flex-col gap-4">
          <ReviewSummaryRow
            label="You pay"
            value={youPayLabel}
            valueIcon={youPayIcon}
          />
          <ReviewSummaryRow label="Fees" value={feesLabel} />
        </div>

        <hr className="border-white/10" />

        <div
          className={classNames(
            "flex gap-2.5 rounded-xl bg-white/[0.05] p-3 text-sm text-white/50",
            drawerBorderLight,
          )}
        >
          <InformationSquareIcon className="size-4 shrink-0 py-0.5 text-white/50" />
          <p>{warningText}</p>
        </div>

        <ActionSubmitButton
          label={submitLabel}
          disabled={submitDisabled}
          isSubmitting={isSubmitting}
          onClick={onSubmit}
          className="!h-10"
        />
      </div>
    </AnimatedModal>
  );
}

function TokenPill({ symbol, amountLabel, icon }: ReviewModalTokenPill) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-white/10 p-1.5 pr-2.5">
      <span className="flex size-6 items-center justify-center overflow-hidden rounded-full bg-[#141414]">
        {icon ?? (
          <span className="text-[10px] font-semibold text-white/80">
            {symbol.slice(0, 1)}
          </span>
        )}
      </span>
      <span className="text-sm font-medium text-white/80">{amountLabel}</span>
    </div>
  );
}
