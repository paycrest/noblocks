"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import {
  Cancel01Icon,
  HelpCircleIcon,
  InformationSquareIcon,
} from "hugeicons-react";

import { drawerCloseButtonClasses } from "@/app/components/drawer/drawerStyles";
import { classNames } from "@/app/utils";

import { TRANSFER_COPY } from "./transferConfig";

type Props = {
  titleId?: string;
  onClose: () => void;
  onConfirm: () => void;
  shortAddress: string;
  amountLabel: string;
  tokenSymbol: string;
  tokenImageUrl?: string;
  networkName: string;
  networkImageUrl?: string;
  feeLabel: string;
  ctaLabel: string;
  isSubmitting?: boolean;
  saveRecipientControl?: ReactNode;
  /** Bridge quote's arrival-time row — shown only when a bridge quote is in play. */
  arrivalTimeLabel?: string | null;
  /** Subtitle under the title. Shown on the Home full-page confirm (Figma 2620:130748); the token-detail overlay (2691:73762) has none. */
  subtitle?: string;
  /** The top-right X — only the token-detail overlay has one; the Home page confirm uses Back instead. */
  showCloseButton?: boolean;
  /**
   * Host chrome: "page" is the Home in-page confirm (Figma 2620:130748) —
   * single-line title, dashed divider, warning below the actions.
   * "drawer" is the token-detail overlay (2691:73762) — wrapped title, warning
   * above the actions. Defaults to "drawer" so existing callers stay as-is.
   */
  chrome?: "drawer" | "page";
};

const rowLabelClasses =
  "text-sm font-normal leading-5 tracking-[-0.14px] text-text-secondary dark:text-white/50";
const rowValueClasses =
  "text-sm font-medium leading-5 tracking-[-0.14px] text-text-body dark:text-white/80";

function SummaryRow({
  label,
  value,
  leading,
  help,
}: {
  label: string;
  value: ReactNode;
  leading?: ReactNode;
  help?: boolean;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-3">
      <span className="flex items-center gap-2">
        <span className={rowLabelClasses}>{label}</span>
        {help ? (
          <span className="flex size-5 shrink-0 items-center justify-center">
            <HelpCircleIcon
              className="size-5 text-icon-outline-secondary dark:text-white/50"
              aria-label={`About ${label}`}
            />
          </span>
        ) : null}
      </span>
      <span
        className={`flex min-w-0 items-center justify-end gap-1 text-right ${rowValueClasses}`}
      >
        {leading}
        <span className="truncate">{value}</span>
      </span>
    </div>
  );
}

function WarningCard() {
  return (
    <div className="flex w-full gap-[10px] rounded-xl border-[0.3px] border-border-light bg-background-neutral p-3 dark:border-white/10 dark:bg-white/5">
      <span className="flex items-start py-0.5">
        <InformationSquareIcon
          className="size-4 shrink-0 text-icon-outline-secondary dark:text-white/50"
          aria-hidden
        />
      </span>
      <p className="min-w-0 flex-1 font-general-sans text-sm font-normal leading-5 tracking-[-0.14px] text-text-secondary dark:text-white/50">
        {TRANSFER_COPY.warning}
      </p>
    </div>
  );
}

function ActionButtons({
  onClose,
  onConfirm,
  ctaLabel,
  isSubmitting,
  buttonHeightClass,
}: {
  onClose: () => void;
  onConfirm: () => void;
  ctaLabel: string;
  isSubmitting?: boolean;
  buttonHeightClass: string;
}) {
  return (
    <div className="flex items-center gap-6">
      <button
        type="button"
        onClick={onClose}
        className={classNames(
          buttonHeightClass,
          "shrink-0 rounded-xl bg-accent-gray px-4 py-2.5 font-general-sans text-sm font-medium leading-5 tracking-[-0.14px] text-text-body transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500 dark:bg-white/10 dark:text-white dark:hover:bg-white/15",
        )}
      >
        {TRANSFER_COPY.back}
      </button>
      <button
        type="button"
        data-testid="transfer-confirm-primary"
        onClick={onConfirm}
        disabled={isSubmitting}
        className={classNames(
          buttonHeightClass,
          "flex-1 rounded-xl bg-lavender-500 px-4 py-2.5 font-general-sans text-sm font-medium leading-5 tracking-[-0.14px] text-white transition-colors hover:bg-lavender-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500 disabled:cursor-not-allowed disabled:bg-border-input disabled:hover:bg-border-input dark:disabled:bg-[#2e2e2e]",
        )}
      >
        {ctaLabel}
      </button>
    </div>
  );
}

/** Confirm content shared by the token-detail overlay (2691:73762) and the Home full-page confirm (2620:130748). */
export function TransferConfirmPanel({
  titleId,
  onClose,
  onConfirm,
  shortAddress,
  amountLabel,
  tokenSymbol,
  tokenImageUrl,
  networkName,
  networkImageUrl,
  feeLabel,
  ctaLabel,
  isSubmitting,
  saveRecipientControl,
  arrivalTimeLabel,
  subtitle,
  showCloseButton = true,
  chrome = "drawer",
}: Props) {
  const isPage = chrome === "page";

  return (
    <div className={classNames("flex w-full flex-col", isPage ? "gap-6" : "gap-4")}>
      <div className="flex items-start justify-between gap-3">
        <div className={classNames("flex min-w-0 flex-col", isPage ? "gap-4" : "gap-1")}>
          {isPage ? (
            <p
              id={titleId}
              className="truncate font-general-sans text-xl font-medium leading-7 text-text-body dark:text-white/80"
            >
              {TRANSFER_COPY.confirmTitle(shortAddress)}
            </p>
          ) : (
            <p
              id={titleId}
              className="text-xl font-semibold leading-7 text-text-primary dark:text-white"
            >
              Confirm transfer to
              <br />
              {shortAddress}
            </p>
          )}
          {subtitle ? (
            <p className="font-general-sans text-sm font-normal leading-5 tracking-[-0.14px] text-text-secondary dark:text-white/50">
              {subtitle}
            </p>
          ) : null}
        </div>
        {showCloseButton ? (
          <button
            type="button"
            aria-label="Close"
            className={drawerCloseButtonClasses}
            onClick={onClose}
          >
            <Cancel01Icon className="size-5" aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="flex w-full flex-col gap-4">
        <SummaryRow
          label={TRANSFER_COPY.amount}
          value={`${amountLabel} ${tokenSymbol}`}
          leading={
            tokenImageUrl ? (
              <Image
                src={tokenImageUrl}
                alt=""
                width={14}
                height={14}
                className="size-3.5 shrink-0"
              />
            ) : undefined
          }
        />
        <SummaryRow
          label={TRANSFER_COPY.network}
          value={networkName}
          help
          leading={
            networkImageUrl ? (
              <Image
                src={networkImageUrl}
                alt=""
                width={18}
                height={18}
                className="size-[18px] shrink-0"
              />
            ) : undefined
          }
        />
        <SummaryRow label={TRANSFER_COPY.fees} value={feeLabel} />
        {arrivalTimeLabel ? (
          <SummaryRow
            label={TRANSFER_COPY.arrivalTime}
            value={arrivalTimeLabel}
          />
        ) : null}
        <SummaryRow label={TRANSFER_COPY.recipientRow} value={shortAddress} />
      </div>

      <hr
        className={classNames(
          "m-0 w-full",
          isPage
            ? "border-dashed border-border-light dark:border-white/10"
            : "border-border-light dark:border-white/10",
        )}
      />

      {saveRecipientControl}

      {isPage ? (
        <>
          <ActionButtons
            onClose={onClose}
            onConfirm={onConfirm}
            ctaLabel={ctaLabel}
            isSubmitting={isSubmitting}
            buttonHeightClass="h-11"
          />
          <WarningCard />
        </>
      ) : (
        <>
          {saveRecipientControl ? (
            <hr className="w-full border-border-light dark:border-white/10" />
          ) : null}
          <WarningCard />
          <ActionButtons
            onClose={onClose}
            onConfirm={onConfirm}
            ctaLabel={ctaLabel}
            isSubmitting={isSubmitting}
            buttonHeightClass="h-10"
          />
        </>
      )}
    </div>
  );
}
