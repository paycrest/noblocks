"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { toast } from "sonner";

import { saveRecipient } from "@/app/api/aggregator";
import { classNames } from "@/app/utils";

import { CreateBeneficiaryModal } from "./CreateBeneficiaryModal";
import { TRANSFER_COPY } from "./transferConfig";

type Props = {
  walletAddress: string;
  networkName: string;
  networkImageUrl?: string;
  /** Called after a successful save, so the caller can e.g. hide the receipt's own offer. */
  onSaved?: () => void;
};

/**
 * Confirm-modal save-recipient switch plus its Create beneficiary modal.
 * Fully independent of the transfer: it never touches amount, validation or
 * the submit path.
 */
export function SaveRecipientToggle({
  walletAddress,
  networkName,
  networkImageUrl,
  onSaved,
}: Props) {
  const { getAccessToken } = usePrivy();
  const [enabled, setEnabled] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleToggle = () => {
    if (enabled) {
      setEnabled(false);
      setIsModalOpen(false);
      return;
    }
    setEnabled(true);
    setIsModalOpen(true);
  };

  // Closing without saving leaves the switch off.
  const handleClose = () => {
    setIsModalOpen(false);
    setEnabled(false);
    toast.error("Recipient was not saved");
  };

  const handleSave = async (name: string) => {
    if (!walletAddress || !name) return;
    setIsSaving(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("Sign in to save this recipient.");
      }
      await saveRecipient(
        { type: "wallet", walletAddress, name },
        accessToken,
      );
      setIsModalOpen(false);
      setEnabled(true);
      toast.success("Recipient saved");
      onSaved?.();
    } catch (error) {
      setIsModalOpen(false);
      setEnabled(false);
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
    <>
      <div className="relative flex h-5 w-full items-center">
        <p className="text-sm font-normal leading-5 tracking-[-0.14px] text-text-secondary dark:text-white/50">
          {TRANSFER_COPY.saveRecipient}
        </p>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={TRANSFER_COPY.saveRecipient}
          onClick={handleToggle}
          className="absolute right-0 top-1/2 flex h-[34px] w-[39px] -translate-y-1/2 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500"
        >
          <span
            className={classNames(
              "relative block h-[17px] w-[32.5px] rounded-full transition-colors",
              enabled
                ? "bg-lavender-500"
                : "bg-border-input dark:bg-white/30",
            )}
          >
            <span
              className={classNames(
                "absolute top-[1.42px] h-[14.17px] w-[18.2px] rounded-full bg-white shadow-sm transition-all",
                enabled ? "left-[13px]" : "left-[1.3px]",
              )}
            />
          </span>
        </button>
      </div>

      <CreateBeneficiaryModal
        isOpen={isModalOpen}
        onClose={handleClose}
        onSave={(name) => void handleSave(name)}
        walletAddress={walletAddress}
        networkName={networkName}
        networkImageUrl={networkImageUrl}
        isSaving={isSaving}
      />
    </>
  );
}
