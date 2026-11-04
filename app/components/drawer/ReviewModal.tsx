"use client";

import type { ReactNode } from "react";
import { useId } from "react";
import { ArrowDown02Icon, Cancel01Icon, InformationSquareIcon } from "hugeicons-react";

import { AnimatedModal } from "@/app/components/AnimatedComponents";
import { classNames } from "@/app/utils";

import { ActionSubmitButton } from "./ActionSubmitButton";
import {
  drawerBodyText,
  drawerBorderLight,
  drawerCloseButtonClasses,
  drawerModalShellClasses,
  drawerModalTitleClasses,
  drawerNeutralCardClasses,
  drawerSecondaryText,
  drawerTokenPillClasses,
  drawerTokenPillIconClasses,
} from "./drawerStyles";
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
  const titleId = useId();

  return (
    <AnimatedModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="24.125rem"
      dialogPanelClassName="!bg-transparent !shadow-none"
      contentClassName={drawerModalShellClasses}
      ariaLabelledBy={titleId}
      scrimClassName="fixed inset-0 bg-black/50"
    >
      <div className="flex flex-col gap-7">
        <div className="flex items-start justify-between gap-3">
          <p id={titleId} className={drawerModalTitleClasses}>
            {title}
          </p>
          <button
            type="button"
            aria-label="Close"
            className={drawerCloseButtonClasses}
            onClick={onClose}
          >
            <Cancel01Icon className="size-5" />
          </button>
        </div>

        <div className="flex items-center justify-center gap-2.5">
          <TokenPill {...from} />
          <ArrowDown02Icon className={classNames("size-4 -rotate-90", drawerSecondaryText)} />
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

        <hr className="border-border-light dark:border-white/10" />

        <div
          className={classNames(
            "flex gap-2.5 rounded-xl p-3 text-sm",
            drawerNeutralCardClasses,
            drawerBorderLight,
            drawerBodyText,
          )}
        >
          <InformationSquareIcon
            className={classNames("size-4 shrink-0 py-0.5", drawerSecondaryText)}
          />
          <p>{warningText}</p>
        </div>

        <ActionSubmitButton
          label={submitLabel}
          disabled={submitDisabled}
          isSubmitting={isSubmitting}
          onClick={onSubmit}
        />
      </div>
    </AnimatedModal>
  );
}

function TokenPill({ symbol, amountLabel, icon }: ReviewModalTokenPill) {
  return (
    <div className={drawerTokenPillClasses}>
      <span className={drawerTokenPillIconClasses}>
        {icon ?? (
          <span className={classNames("text-[10px] font-semibold", drawerModalTitleClasses)}>
            {symbol.slice(0, 1)}
          </span>
        )}
      </span>
          <span className={classNames("text-sm font-medium", drawerModalTitleClasses)}>
        {amountLabel}
      </span>
    </div>
  );
}
