"use client";

import { useEffect, useId, useState } from "react";
import Image from "next/image";
import { ArrowDown01Icon, Cancel01Icon } from "hugeicons-react";

import { AnimatedModal } from "@/app/components/AnimatedComponents";
import { classNames } from "@/app/utils";

import { TRANSFER_MODAL_SCRIM } from "./transferConfig";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  walletAddress: string;
  networkName: string;
  networkImageUrl?: string;
  isSaving?: boolean;
};

/** Centred Create beneficiary modal (Figma 3038:152780). */
export function CreateBeneficiaryModal({
  isOpen,
  onClose,
  onSave,
  walletAddress,
  networkName,
  networkImageUrl,
  isSaving = false,
}: Props) {
  const [name, setName] = useState("");
  const titleId = useId();
  const canSave = name.trim().length > 0 && !isSaving;

  useEffect(() => {
    if (!isOpen) setName("");
  }, [isOpen]);

  return (
    <AnimatedModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="401px"
      dialogPanelClassName="!bg-transparent !shadow-none"
      contentClassName="!rounded-[20px] !border-[0.3px] !border-border-light !bg-white !p-5 !shadow-2xl dark:!border-white/10 dark:!bg-[#2b2b2b]"
      ariaLabelledBy={titleId}
      scrimClassName={TRANSFER_MODAL_SCRIM}
    >
      <div className="flex w-full flex-col gap-[25px]">
        <div className="flex items-start justify-between gap-3">
          <p
            id={titleId}
            className="text-xl font-bold leading-9 text-text-primary dark:text-white"
          >
            Create beneficiary
          </p>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="relative mt-1 inline-flex items-center justify-center text-icon-outline-secondary transition-colors hover:text-text-body focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500 dark:text-white/50 dark:hover:text-white"
          >
            <Cancel01Icon className="size-[18px]" aria-hidden />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label
              htmlFor="beneficiary-name"
              className="text-sm font-medium leading-5 tracking-[-0.14px] text-text-primary dark:text-white"
            >
              Name
            </label>
            <input
              id="beneficiary-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter beneficiary name"
              autoFocus={isOpen}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canSave) {
                  event.preventDefault();
                  onSave(name.trim());
                }
              }}
              className="w-full rounded-xl border border-border-input bg-white px-4 py-2.5 text-sm leading-5 tracking-[-0.14px] text-text-body outline-none placeholder:text-text-secondary focus:border-[#0065f5] focus:shadow-[0_0_0_1px_#0065f5] dark:border-white/20 dark:bg-white/[0.05] dark:text-white dark:placeholder:text-white/50"
            />
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium leading-5 tracking-[-0.14px] text-text-primary dark:text-white">
              Address
            </p>
            <div className="flex w-full items-center overflow-hidden rounded-xl border border-border-input bg-accent-gray px-4 py-2.5 dark:border-white/20 dark:bg-white/[0.05]">
              <span className="min-w-0 flex-1 truncate text-sm leading-5 tracking-[-0.14px] text-text-disabled dark:text-white/40">
                {walletAddress}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium leading-5 tracking-[-0.14px] text-text-primary dark:text-white">
              Network
            </p>
            <div className="flex w-full items-center gap-2 rounded-xl border border-border-input bg-accent-gray px-4 py-2.5 dark:border-white/20 dark:bg-white/[0.05]">
              {networkImageUrl ? (
                <Image
                  src={networkImageUrl}
                  alt=""
                  width={18}
                  height={18}
                  className="size-[18px] shrink-0"
                />
              ) : null}
              <span className="min-w-0 flex-1 truncate text-sm leading-5 tracking-[-0.14px] text-text-disabled dark:text-white/40">
                {networkName}
              </span>
              <ArrowDown01Icon
                className="size-[18px] shrink-0 text-icon-outline-secondary dark:text-white/40"
                aria-hidden
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onSave(name.trim())}
          disabled={!canSave}
          aria-busy={isSaving || undefined}
          className={classNames(
            "flex h-11 w-full items-center justify-center rounded-xl px-3 text-sm font-medium text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500",
            canSave
              ? "bg-lavender-500 hover:bg-lavender-600"
              : "cursor-not-allowed bg-border-input dark:bg-[#2e2e2e] dark:text-white/50",
          )}
        >
          Save beneficiary
        </button>
      </div>
    </AnimatedModal>
  );
}
