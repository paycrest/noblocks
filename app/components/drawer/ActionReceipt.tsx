"use client";

import type { ReactNode } from "react";
import { useId } from "react";
import { CancelCircleIcon, LinkSquare02Icon } from "hugeicons-react";

import { AnimatedModal } from "@/app/components/AnimatedComponents";
import { classNames } from "@/app/utils";

import { ActionSubmitButton } from "./ActionSubmitButton";
import {
  drawerBodyText,
  drawerBorderLight,
  drawerFailedStatusClasses,
  drawerModalShellClasses,
  drawerNeutralCardClasses,
  drawerReceiptTitleClasses,
  drawerSecondaryText,
  drawerStepHeadingClasses,
} from "./drawerStyles";
import {
  buildDefaultReceiptRows,
  ReceiptDashedRule,
  ReceiptMetaRows,
} from "./ReceiptMetaRows";
import { SuccessCheckmark } from "./SuccessCheckmark";
import { getAllowlistedExplorerUrl } from "./explorer";

export type ActionReceiptSuccessProps = {
  variant: "drawer" | "modal";
  isOpen?: boolean;
  onClose?: () => void;
  title: string;
  subtitle?: string;
  fundStatusLabel: string;
  timeSpentLabel: string;
  networkName: string;
  txHash?: string | null;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  tokenPair?: ReactNode;
};

export type ActionReceiptFailedProps = {
  title?: string;
  body: ReactNode;
  refundNote?: string;
  failureReasonTitle?: string;
  failureReasonBody?: string;
  fundStatusLabel: string;
  timeSpentLabel: string;
  networkName: string;
  txHash?: string | null;
  onRetry?: () => void;
};

export function ActionReceiptSuccess({
  variant,
  isOpen = true,
  onClose,
  title,
  subtitle,
  fundStatusLabel,
  timeSpentLabel,
  networkName,
  txHash,
  primaryActionLabel,
  secondaryActionLabel = "Done",
  onPrimaryAction,
  onSecondaryAction,
  tokenPair,
}: ActionReceiptSuccessProps) {
  const modalTitleId = useId();
  const rows = buildDefaultReceiptRows({
    transactionStatusLabel: "Completed",
    transactionStatusTone: "success",
    fundStatusLabel,
    timeSpentLabel,
  });

  const titleBlock = (
    <>
      <SuccessCheckmark
        size={variant === "drawer" ? 54 : 40}
        strokeWidth={variant === "drawer" ? 2.7 : 2}
      />
      <div className="w-full space-y-1 text-center">
        <p
          id={variant === "modal" ? modalTitleId : undefined}
          className={drawerReceiptTitleClasses}
        >
          {title}
        </p>
        {subtitle ? (
          <p className={classNames("text-sm", drawerSecondaryText)}>{subtitle}</p>
        ) : null}
      </div>
      {tokenPair ? (
        <div className="flex justify-center">{tokenPair}</div>
      ) : null}
    </>
  );

  if (variant === "modal") {
    return (
      <AnimatedModal
        isOpen={isOpen}
        onClose={() => onClose?.()}
        maxWidth="24.625rem"
        contentClassName={drawerModalShellClasses}
        ariaLabelledBy={modalTitleId}
        scrimClassName="fixed inset-0 bg-black/50"
      >
        <div className="flex flex-col items-center gap-5 pt-[34px]">
          {titleBlock}
          <ReceiptDashedRule />
          <ReceiptMetaRows
            rows={rows}
            networkName={networkName}
            txHash={null}
            layout="modal"
          />
          <ReceiptDashedRule />
          <ModalSuccessFooter
            networkName={networkName}
            txHash={txHash}
            onClose={onClose ?? onSecondaryAction}
          />
        </div>
      </AnimatedModal>
    );
  }

  return (
    <div className="flex w-full flex-col items-center pt-5">
      {titleBlock}
      <ReceiptDashedRule className="mt-[30px]" />
      <div className="mt-5 w-full">
        <ReceiptMetaRows
          rows={rows}
          networkName={networkName}
          txHash={txHash}
          layout="drawer"
        />
      </div>
      <ReceiptDashedRule className="mt-5" />
      <div className="mt-5 flex w-full gap-3">
        <ActionSubmitButton
          label={secondaryActionLabel}
          variant="secondary"
          onClick={() => onSecondaryAction?.()}
          className="!min-h-[42px] flex-1"
        />
        {primaryActionLabel ? (
          <ActionSubmitButton
            label={primaryActionLabel}
            onClick={() => onPrimaryAction?.()}
            className="!min-h-[42px] flex-1"
          />
        ) : null}
      </div>
    </div>
  );
}

function ModalSuccessFooter({
  networkName,
  txHash,
  onClose,
}: {
  networkName: string;
  txHash?: string | null;
  onClose?: () => void;
}) {
  const explorerUrl = getAllowlistedExplorerUrl(networkName, txHash);
  return (
    <div className="flex w-full flex-col items-center gap-5">
      {explorerUrl ? (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-lavender-500 hover:underline"
        >
          View in explorer
          <LinkSquare02Icon className="size-4 shrink-0" aria-hidden />
          <span className="sr-only">(opens in new tab)</span>
        </a>
      ) : null}
      <ActionSubmitButton
        label="Close"
        variant="secondary"
        onClick={() => onClose?.()}
        className="!min-h-[42px]"
      />
    </div>
  );
}

export function ActionReceiptFailed({
  title = "Oops! Transaction failed",
  body,
  refundNote = "Token will be refunded to your account",
  failureReasonTitle = "Reason for failure",
  failureReasonBody,
  fundStatusLabel,
  timeSpentLabel,
  networkName,
  txHash,
  onRetry,
}: ActionReceiptFailedProps) {
  const rows = buildDefaultReceiptRows({
    transactionStatusLabel: "Failed",
    transactionStatusTone: "failed",
    fundStatusLabel,
    timeSpentLabel,
  });

  return (
    <div className="mx-auto flex w-full max-w-[320px] flex-col items-center gap-4 pt-6">
      <CancelCircleIcon className={classNames("size-10", drawerFailedStatusClasses)} />
      <div className="w-full space-y-2 text-center">
        <p className={drawerReceiptTitleClasses}>{title}</p>
        <div className={classNames("text-sm", drawerBodyText)}>{body}</div>
        <div className="h-5" aria-hidden />
        <p className={classNames("text-sm", drawerBodyText)}>{refundNote}</p>
      </div>

      {failureReasonBody ? (
        <div
          className={classNames(
            "w-full rounded-xl px-4 pb-4 pt-3 text-left",
            drawerNeutralCardClasses,
            drawerBorderLight,
          )}
        >
          <p className={drawerStepHeadingClasses}>{failureReasonTitle}</p>
          <p className={classNames("mt-2 text-sm", drawerBodyText)}>
            {failureReasonBody}
          </p>
        </div>
      ) : null}

      {onRetry ? (
        <ActionSubmitButton
          label="Retry transaction"
          variant="pill"
          onClick={onRetry}
        />
      ) : null}

      <ReceiptDashedRule />
      <ReceiptMetaRows
        rows={rows}
        networkName={networkName}
        txHash={txHash}
        layout="failed"
      />
    </div>
  );
}

export type ActionReceiptModalSuccessProps = Omit<
  ActionReceiptSuccessProps,
  "variant"
> & {
  isOpen: boolean;
  onClose: () => void;
};

export function ActionReceiptModalSuccess({
  isOpen,
  onClose,
  ...rest
}: ActionReceiptModalSuccessProps) {
  if (!isOpen) {
    return null;
  }
  return (
    <ActionReceiptSuccess
      {...rest}
      variant="modal"
      isOpen={isOpen}
      onClose={onClose}
      onSecondaryAction={onClose}
    />
  );
}
