"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { toast } from "sonner";

import { saveRecipient } from "@/app/api/aggregator";
import { AnimatedModal } from "@/app/components/AnimatedComponents";
import {
  drawerModalScrimClasses,
  drawerSecondaryButtonClasses,
} from "@/app/components/drawer/drawerStyles";
import { SuccessCheckmark } from "@/app/components/drawer/SuccessCheckmark";

import { CreateBeneficiaryModal } from "./CreateBeneficiaryModal";
import { TRANSFER_COPY } from "./transferConfig";

type Props = {
  isOpen: boolean;
  amountLabel: string;
  tokenSymbol: string;
  explorerLink?: string;
  onClose: () => void;
  /**
   * Offers "Save beneficiary" as a secondary text control — frame 97
   * (3034:152339) draws no such row, added per KAN-973 AC6. Only passed true
   * when the recipient is an EVM address not already saved, and not saved
   * earlier in this same flow via the confirm-step toggle.
   */
  offerSaveBeneficiary?: boolean;
  recipientAddress?: string;
  recipientNetworkName?: string;
  recipientNetworkImageUrl?: string;
};

/** Home full-page compact success modal (Figma frame 97 / 3034:152339). */
export function TransferSuccessCompactModal({
  isOpen,
  amountLabel,
  tokenSymbol,
  explorerLink,
  onClose,
  offerSaveBeneficiary,
  recipientAddress,
  recipientNetworkName,
  recipientNetworkImageUrl,
}: Props) {
  const titleId = useId();
  const { getAccessToken } = usePrivy();
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  // Bumped every time the receipt closes, so a save that resolves after close
  // (for a since-reopened receipt showing a different, unsaved recipient)
  // can't set `justSaved` on that later receipt.
  const sessionRef = useRef(0);

  // Reset once the receipt closes, so the next completed transfer re-evaluates
  // `offerSaveBeneficiary` fresh instead of carrying over a stale "saved" flag.
  useEffect(() => {
    if (!isOpen) {
      sessionRef.current += 1;
      setIsSaveModalOpen(false);
      setJustSaved(false);
    }
  }, [isOpen]);

  const handleSaveBeneficiary = async (name: string) => {
    if (!recipientAddress || !name) return;
    const session = sessionRef.current;
    setIsSaving(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("Sign in to save this recipient.");
      }
      await saveRecipient(
        { type: "wallet", walletAddress: recipientAddress, name },
        accessToken,
      );
      if (sessionRef.current === session) {
        setIsSaveModalOpen(false);
        setJustSaved(true);
      }
      toast.success("Recipient saved");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not save this recipient. Try again.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatedModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="320px"
      dialogPanelClassName="!bg-transparent !shadow-none"
      contentClassName="!rounded-[32px] !border !border-border-light !bg-white !p-5 !shadow-2xl dark:!border-white/10 dark:!bg-[#2b2b2b]"
      ariaLabelledBy={titleId}
      scrimClassName={drawerModalScrimClasses}
    >
      <div className="flex w-full flex-col items-center gap-4 text-center">
        <SuccessCheckmark size={40} strokeWidth={2} />

        <p
          id={titleId}
          className="w-full font-general-sans text-xl font-medium leading-7 text-text-primary dark:text-white"
        >
          {TRANSFER_COPY.successTitle}
        </p>

        <p className="font-general-sans text-sm font-medium leading-5 tracking-[-0.14px] text-text-secondary dark:text-white/50">
          <span className="text-text-primary dark:text-white">
            {amountLabel} {tokenSymbol}
          </span>{" "}
          has been successfully transferred to the recipient.
        </p>

        {explorerLink ? (
          <a
            href={explorerLink}
            target="_blank"
            rel="noopener noreferrer"
            className="font-general-sans text-sm font-medium leading-5 tracking-[-0.14px] text-lavender-500"
          >
            {TRANSFER_COPY.viewInExplorer}
            <span className="sr-only">(opens in new tab)</span>
          </a>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          className={drawerSecondaryButtonClasses}
        >
          Close
        </button>
        {offerSaveBeneficiary && !justSaved ? (
          <button
            type="button"
            onClick={() => setIsSaveModalOpen(true)}
            className="font-general-sans text-sm font-medium leading-5 tracking-[-0.14px] text-lavender-500 transition-colors hover:text-lavender-600"
          >
            {TRANSFER_COPY.saveBeneficiary}
          </button>
        ) : null}
      </div>

      {recipientAddress ? (
        <CreateBeneficiaryModal
          isOpen={isSaveModalOpen}
          onClose={() => setIsSaveModalOpen(false)}
          onSave={(name) => void handleSaveBeneficiary(name)}
          walletAddress={recipientAddress}
          networkName={recipientNetworkName ?? ""}
          networkImageUrl={recipientNetworkImageUrl}
          isSaving={isSaving}
        />
      ) : null}
    </AnimatedModal>
  );
}
