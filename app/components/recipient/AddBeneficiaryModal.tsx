"use client";

import { useState, useEffect } from "react";
import { DialogTitle } from "@headlessui/react";
import { Cancel01Icon } from "hugeicons-react";
import Image from "next/image";
import { AnimatedModal } from "../AnimatedComponents";
import { primaryBtnClasses } from "..";
import { getAvatarImage, shortenAddress } from "../../utils";

interface AddBeneficiaryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (name: string) => void;
    walletAddress: string;
    isSaving?: boolean;
}

export function AddBeneficiaryModal({
    isOpen,
    onClose,
    onSave,
    walletAddress,
    isSaving = false,
}: AddBeneficiaryModalProps) {
    const [recipientName, setRecipientName] = useState("");

    // Reset name when modal opens/closes
    useEffect(() => {
        if (!isOpen) {
            setRecipientName("");
        }
    }, [isOpen]);

    const handleSave = () => {
        const trimmedName = recipientName.trim();
        if (trimmedName) {
            onSave(trimmedName);
        }
    };

    const handleClose = () => {
        setRecipientName("");
        onClose();
    };

    return (
        <AnimatedModal isOpen={isOpen} onClose={handleClose} maxWidth="28.5rem">
            <div className="relative">
                <button
                    type="button"
                    onClick={handleClose}
                    aria-label="Close add beneficiary modal"
                    className="absolute right-0 top-0 rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10"
                >
                    <Cancel01Icon className="size-5 text-outline-gray dark:text-white/50" />
                </button>
                <DialogTitle className="text-center text-lg font-semibold dark:text-white sm:text-base">
                    Add to beneficiary list
                </DialogTitle>
            </div>

            <div className="mt-6 space-y-5">
                {/* Avatar - centered at top */}
                <div className="flex justify-center">
                    <div className="flex size-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-full">
                        <Image
                            src={getAvatarImage(0)}
                            alt="Wallet avatar"
                            width={64}
                            height={64}
                            className="size-full object-cover"
                        />
                    </div>
                </div>

                <div>
                    <input
                        value={recipientName}
                        onChange={(e) => setRecipientName(e.target.value)}
                        placeholder="Enter name"
                        autoFocus={isOpen}
                        className="w-full rounded-lg border-0 bg-transparent px-4 py-3 text-center text-sm text-white placeholder-neutral-500 outline-none"
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && recipientName.trim() && !isSaving) {
                                handleSave();
                            }
                        }}
                    />
                </div>
                <p className="text-center text-sm text-neutral-400 dark:text-white/40">
                    {shortenAddress(walletAddress, 6, 4)}
                </p>
            </div>

            <div className="mt-8 flex items-center gap-3">
                <button
                    type="button"
                    onClick={handleClose}
                    className="rounded-lg bg-neutral-800 px-4 py-3 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                    style={{ width: "35%" }}
                >
                    Cancel
                </button>
                <button
                    type="button"
                    disabled={isSaving || !recipientName.trim()}
                    onClick={handleSave}
                    className={`rounded-lg px-4 py-3 text-sm font-medium transition ${isSaving || !recipientName.trim()
                        ? "cursor-not-allowed bg-neutral-700 text-neutral-500"
                        : "bg-lavender-500 text-white hover:bg-lavender-600"
                        }`}
                    style={{ width: "65%" }}
                >
                    {isSaving ? "Saving..." : "Save"}
                </button>
            </div>
        </AnimatedModal>
    );
}