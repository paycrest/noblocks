"use client";

import { DialogTitle } from "@headlessui/react";
import { motion } from "framer-motion";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";
import { usePrivy } from "@privy-io/react-auth";
import { AnimatedModal } from "./AnimatedComponents";
import { useNetwork } from "../context/NetworksContext";
import { submitReferralCode } from "../api/aggregator";

interface ReferralInputModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmitSuccess: () => void;
}

export const ReferralInputModal = ({
    isOpen,
    onClose,
    onSubmitSuccess,
}: ReferralInputModalProps) => {
    const [referralCode, setReferralCode] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { selectedNetwork } = useNetwork();
    const { getAccessToken } = usePrivy();

    const sponsorChain = selectedNetwork?.chain.name || "Sponsor Chain";

    const handleSubmit = async () => {
        if (!referralCode.trim()) {
            toast.error("Please enter a referral code");
            return;
        }

        setIsSubmitting(true);

        try {
            const code = referralCode.trim().toUpperCase();
            if (!/^NB[A-Z0-9]{4}$/.test(code)) {
                toast.error("Invalid referral code format");
                return;
            }

            const token = await getAccessToken();

            try {
                const res = await submitReferralCode(code, token ?? undefined);

                if (res && res.success) {
                    toast.success(res.data?.message || "Referral code applied! Complete KYC and your first transaction to earn rewards.");
                    onSubmitSuccess();
                    onClose();
                } else {
                    // API returned a well-formed error response
                    const message = res && !res.success ? res.error : "Failed to submit referral code. Please try again.";
                    toast.error(message);
                }
            } catch (err) {
                // Unexpected errors (should be rare since submitReferralCode returns ApiResponse)
                const message = err instanceof Error ? err.message : "Failed to submit referral code. Please try again.";
                toast.error(message);
            }
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : "Invalid referral code. Please check and try again."
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSkip = () => {
        setReferralCode("");
        onClose();
    };

    return (
        <AnimatedModal isOpen={isOpen} onClose={handleSkip} maxWidth="28.5rem">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.3 }}
                className="space-y-4"
            >
                <div className="space-y-3">
                    <Image
                        src="/images/referral-graphic.png"
                        alt="Referral"
                        width={60}
                        height={60}
                        className="h-[60px] w-[60px]"
                    />
                    <DialogTitle className="text-lg font-semibold text-text-body dark:text-white">
                        Were you referred by a friend?
                    </DialogTitle>
                </div>

                <p className="text-sm text-text-secondary dark:text-white/50">
                    Enter your referral code below and get $1 on your first $20 transaction on {sponsorChain}
                </p>

                <div className="space-y-3">
                    <div className="w-full space-y-1 rounded-xl bg-background-neutral px-4 py-3 dark:bg-white/5">
                        <label className="text-sm font-medium text-text-secondary dark:text-white/50">
                            Enter referral code
                        </label>
                        <input
                            type="text"
                            value={referralCode}
                            onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                            placeholder="NB738K"
                            className="w-full border-0 bg-transparent pt-2 text-base font-medium text-text-body placeholder:text-text-secondary focus:outline-none focus:ring-0 dark:text-white dark:placeholder:text-white/30"
                            maxLength={6}
                            disabled={isSubmitting}
                            autoFocus
                        />
                    </div>

                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSubmitting || !referralCode.trim()}
                        className="min-h-11 w-full rounded-xl bg-lavender-500 py-2 text-sm font-medium text-white disabled:text-white/30 transition-colors hover:bg-lavender-600 disabled:cursor-not-allowed disabled:dark:bg-white/5"
                    >
                        {isSubmitting ? "Submitting..." : "Submit"}
                    </button>

                    <button
                        type="button"
                        onClick={handleSkip}
                        className="min-h-11 w-full rounded-xl bg-accent-gray py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-accent-gray/80 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                    >
                        I don't have a referral code
                    </button>
                </div>
            </motion.div>
        </AnimatedModal>
    );
};