"use client";

import { useId, type ReactNode } from "react";

import { AnimatedModal } from "@/app/components/AnimatedComponents";
import { drawerModalScrimClasses } from "@/app/components/drawer/drawerStyles";

import { TransferConfirmPanel } from "./TransferConfirmPanel";

type Props = {
  isOpen: boolean;
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
};

/** Token-detail confirm overlay (Figma 2691:73762). */
export function TransferConfirmModal({ isOpen, onClose, ...panelProps }: Props) {
  const titleId = useId();

  return (
    <AnimatedModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="361px"
      dialogPanelClassName="!bg-transparent !shadow-none"
      contentClassName="!rounded-[32px] !border !border-border-light !bg-white !p-5 !shadow-[0_25px_50px_-12px_rgba(18,18,23,0.25)] dark:!border-white/10 dark:!bg-[#2b2b2b]"
      ariaLabelledBy={titleId}
      scrimClassName={drawerModalScrimClasses}
    >
      <TransferConfirmPanel titleId={titleId} onClose={onClose} {...panelProps} />
    </AnimatedModal>
  );
}
