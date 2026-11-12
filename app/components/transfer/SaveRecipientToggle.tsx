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
  /** Called with the saved address after a successful save, so the caller can e.g. hide the receipt's own offer. */
  onSaved?: (walletAddress: string) => void;
  /**
   * "switch" is the token-detail overlay (Figma 2691:73762).
   * "checkbox" is the Home page confirm bar (Figma 2620:131092).
   */
  appearance?: "switch" | "checkbox";
  /** Defaults to TRANSFER_COPY.saveRecipient ("Save recipient to contacts"). */
  label?: string;
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
  appearance = "switch",
  label = TRANSFER_COPY.saveRecipient,
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
      onSaved?.(walletAddress);
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
      {appearance === "checkbox" ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={enabled}
          aria-label={label}
          onClick={handleToggle}
          className="flex h-12 w-full items-center gap-2 rounded-xl bg-background-neutral px-3 dark:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500"
        >
          <span
            className={classNames(
              "flex size-5 shrink-0 items-center justify-center rounded-[6px] border transition-colors",
              enabled
                ? "border-lavender-500 bg-lavender-500"
                : "border-border-light bg-transparent dark:border-white/20",
            )}
            aria-hidden
          >
            {enabled ? (
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M2.5 6.2L4.8 8.5L9.5 3.5"
                  stroke="white"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : null}
          </span>
          <span className="font-general-sans text-sm font-medium leading-5 tracking-[-0.14px] text-text-body dark:text-white">
            {label}
          </span>
        </button>
      ) : (
        <div className="relative flex h-5 w-full items-center">
          <p className="text-sm font-normal leading-5 tracking-[-0.14px] text-text-secondary dark:text-white/50">
            {label}
          </p>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={label}
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
      )}

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
