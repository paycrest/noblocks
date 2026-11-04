"use client";

import type { ReactNode } from "react";
import {
  CancelCircleIcon,
  CheckmarkCircle01Icon,
} from "hugeicons-react";

import { AnimatedModal } from "@/app/components/AnimatedComponents";
import { classNames } from "@/app/utils";

import { ActionSubmitButton } from "./ActionSubmitButton";
import { drawerBorderLight } from "./drawerStyles";
import {
  buildDefaultReceiptRows,
  ReceiptDashedRule,
  ReceiptMetaRows,
} from "./ReceiptMetaRows";
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
  variant: "drawer";
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
  const rows = buildDefaultReceiptRows({
    transactionStatusLabel: "Completed",
    transactionStatusTone: "success",
    fundStatusLabel,
    timeSpentLabel,
  });

  const titleBlock = (
    <>
      <CheckmarkCircle01Icon
        className={classNames(
          variant === "drawer" ? "size-[54px]" : "size-10",
          "text-[#39c65d]",
        )}
      />
      <div className="w-full space-y-1 text-center">
        <p className="text-xl font-medium text-white/80">{title}</p>
        {subtitle ? (
          <p className="text-sm text-white/50">{subtitle}</p>
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
        contentClassName="!rounded-[32px] !border !border-white/10 !bg-[#2b2b2b] !p-5 dark:!bg-[#2b2b2b]"
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
          className="h-[42px] flex-1"
        />
        {primaryActionLabel ? (
          <ActionSubmitButton
            label={primaryActionLabel}
            onClick={() => onPrimaryAction?.()}
            className="h-[42px] flex-1"
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
          className="text-sm text-lavender-500 hover:underline"
        >
          View in explorer
        </a>
      ) : null}
      <ActionSubmitButton
        label="Close"
        variant="secondary"
        onClick={() => onClose?.()}
        className="!h-[42px]"
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
      <CancelCircleIcon className="size-10 text-[#f53d6b]" />
      <div className="w-full space-y-2 text-center">
        <p className="text-xl font-medium text-white/80">{title}</p>
        <div className="text-sm text-white/50">{body}</div>
        <div className="h-5" aria-hidden />
        <p className="text-sm text-white/50">{refundNote}</p>
      </div>

      {failureReasonBody ? (
        <div
          className={classNames(
            "w-full rounded-xl bg-white/[0.05] px-4 pb-4 pt-3 text-left",
            drawerBorderLight,
          )}
        >
          <p className="text-sm font-medium text-white/80">{failureReasonTitle}</p>
          <p className="mt-2 text-sm text-white/50">{failureReasonBody}</p>
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
