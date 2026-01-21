"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Dialog } from "@headlessui/react";
import { toast } from "sonner";
import { ArrowLeft02Icon, Copy01Icon } from "hugeicons-react";
import { PiCheck } from "react-icons/pi";
import Image from "next/image";
import { getReferralData } from "@/app/api/aggregator";
import { usePrivy } from "@privy-io/react-auth";
import { sidebarAnimation } from "./AnimatedComponents";
import { ReferralDashboardSkeleton } from "./ReferralDashboardSkeleton";
import { getAvatarImage, handleCopyCode, handleCopyLink } from "../utils";

export const ReferralDashboard = ({
    isOpen,
    onClose,
}: {
    isOpen: boolean;
    onClose: () => void;
}) => {
    const { getAccessToken } = usePrivy();
    const [referralData, setReferralData] = useState<any | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<"pending" | "earned">("pending");
    const [showCopiedMessage, setShowCopiedMessage] = useState(false);

    useEffect(() => {
        if (!isOpen) return;

        let mounted = true;

        async function fetchData() {
            try {
                setIsLoading(true);
                const token = await getAccessToken();
                if (!token) return;
                const response = await getReferralData(token);
                if (mounted && response.success) {
                    setReferralData(response.data);
                } else if (mounted) {
                    setReferralData(null);
                }
            } catch (error) {
                console.error("Failed to fetch referral data:", error);
                if (mounted) {
                    toast.error("Failed to load referral data");
                    setReferralData(null);
                }
            } finally {
                if (mounted) setIsLoading(false);
            }
        }

        fetchData();

        return () => {
            mounted = false;
        };
    }, [getAccessToken, isOpen]);

    const onCopyCode = () => {
        handleCopyCode(referralData?.referral_code, setShowCopiedMessage);
    };

    const onCopyLink = () => {
        handleCopyLink(referralData?.referral_code);
    };

    const filteredReferrals: any[] = (referralData?.referrals || []).filter(
        (r: any) => r.status === activeTab
    );

    if (isLoading) {
        return (
            <AnimatePresence>
                {isOpen && (
                    <Dialog as="div" className="fixed inset-0 z-50" open={isOpen} onClose={onClose}>
                        <div className="flex h-full">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 bg-black/30 backdrop-blur-sm"
                                onClick={onClose}
                            />
                            <motion.div
                                {...sidebarAnimation}
                                className="z-50 my-4 ml-auto mr-4 flex h-[calc(100%-32px)] w-full max-w-[420px] flex-col overflow-hidden rounded-[20px] border border-border-light bg-white shadow-lg dark:border-white/5 dark:bg-surface-overlay"
                            >
                                <ReferralDashboardSkeleton />
                            </motion.div>
                        </div>
                    </Dialog>
                )}
            </AnimatePresence>
        );
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <Dialog as="div" className="fixed inset-0 z-50" open={isOpen} onClose={onClose}>
                    <div className="flex h-full">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/30 backdrop-blur-sm"
                            onClick={onClose}
                        />

                        <motion.div
                            {...sidebarAnimation}
                            className="z-50 my-4 ml-auto mr-4 flex h-[calc(100%-32px)] w-full max-w-[420px] flex-col overflow-hidden rounded-[20px] border border-border-light bg-white shadow-lg dark:border-white/5 dark:bg-surface-overlay"
                        >
                            {/* Fixed Header */}
                            <div className="mb-2 mt-3 pl-6 pt-4 flex-shrink-0">
                                <button
                                    type="button"
                                    aria-label="Close referrals"
                                    onClick={onClose}
                                    className="mb-4 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-white/10"
                                >
                                    <ArrowLeft02Icon className="size-5 text-outline-gray dark:text-white/50" />
                                </button>
                                <h1 className="text-lg font-semibold text-text-body dark:text-white">
                                    Referrals
                                </h1>
                            </div>

                            {/* Fixed Content Section - No Scroll */}
                            <div className="flex-shrink-0 px-5">
                                <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border-light bg-border-light dark:border-white/10 dark:bg-transparent">
                                    <div className="border-r border-border-light bg-transparent p-4 dark:border-white/10">
                                        <p className="mb-1 text-sm text-text-secondary dark:text-white/60">
                                            Earned
                                        </p>
                                        <p className="text-lg font-semibold text-text-body dark:text-white">
                                            {referralData?.total_earned?.toFixed(1) ?? "0.0"} USDC
                                        </p>
                                    </div>
                                    <div className="bg-transparent p-4">
                                        <p className="mb-1 text-sm text-text-secondary dark:text-white/60">
                                            Pending
                                        </p>
                                        <p className="text-lg font-semibold text-text-body dark:text-white">
                                            {referralData?.total_pending?.toFixed(0) ?? "0"} USDC
                                        </p>
                                    </div>
                                </div>

                                <div className="mb-4 space-y-3 rounded-2xl border border-border-light bg-transparent p-4 dark:border-white/10">
                                    <p className="text-sm text-text-secondary dark:text-white/60">
                                        Your invite code
                                    </p>

                                    <div className="flex items-center justify-between">
                                        <p className="text-2xl font-bold tracking-wider text-text-body dark:text-white">
                                            {referralData?.referral_code ?? "No code yet"}
                                        </p>
                                        <button
                                            onClick={onCopyCode}
                                            aria-pressed={showCopiedMessage}
                                            className="flex items-center gap-1.5 rounded-lg px-3 py-2 hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-50"
                                            disabled={!referralData?.referral_code}
                                        >
                                            {showCopiedMessage ? (
                                                <>
                                                    <PiCheck className="size-4 text-lavender-500" />
                                                    <span className="text-sm font-medium text-lavender-500">
                                                        Copied
                                                    </span>
                                                </>
                                            ) : (
                                                <>
                                                    <Copy01Icon className="size-4 text-lavender-500" />
                                                    <span className="text-sm font-medium text-lavender-500">
                                                        Copy
                                                    </span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>

                                <div className="mb-4">
                                    <button
                                        onClick={onCopyLink}
                                        className="min-h-11 w-full rounded-xl bg-lavender-500 py-3 text-base font-medium text-white transition-colors hover:bg-lavender-600 disabled:opacity-50"
                                        disabled={!referralData?.referral_code}
                                    >
                                        Copy Invite Link
                                    </button>
                                </div>

                                <p className="mb-6 text-sm leading-relaxed text-text-secondary dark:text-white/60">
                                    Earn when you refer your friends. You both get $1 when they
                                    complete their first $100 transaction.
                                </p>
                            </div>

                            {/* Scrollable Section - Tabs and Referral List */}
                            <div className="flex-1 flex flex-col min-h-0 px-5 pb-6">
                                {/* Tabs */}
                                <div className="mb-4 flex gap-6 flex-shrink-0">
                                    <button
                                        onClick={() => setActiveTab("pending")}
                                        className={`text-base font-medium transition-colors ${activeTab === "pending"
                                            ? "text-text-body dark:text-white"
                                            : "text-text-secondary dark:text-white/50"
                                            }`}
                                    >
                                        Pending
                                    </button>

                                    <button
                                        onClick={() => setActiveTab("earned")}
                                        className={`text-base font-medium transition-colors ${activeTab === "earned"
                                            ? "text-text-body dark:text-white"
                                            : "text-text-secondary dark:text-white/50"
                                            }`}
                                    >
                                        Earned
                                    </button>
                                </div>

                                {/* Referral List - Scrollable Container */}
                                <div
                                    className="flex-1 overflow-y-auto space-y-3 scrollbar-hide"
                                    style={{
                                        scrollbarWidth: 'none',
                                        msOverflowStyle: 'none',
                                    }}
                                >
                                    {filteredReferrals.length === 0 ? (
                                        <div className="rounded-2xl border border-border-light bg-transparent p-8 text-center dark:border-white/10">
                                            <p className="text-sm text-text-secondary dark:text-white/60">
                                                {activeTab === "pending"
                                                    ? "No pending referrals yet"
                                                    : "No earned referrals yet"}
                                            </p>
                                        </div>
                                    ) : (
                                        filteredReferrals.map((referral) => (
                                            <div
                                                key={referral.id}
                                                className="flex items-center justify-between py-2"
                                            >
                                                <div className="flex items-center gap-3">
                                                    {/* Avatar */}
                                                    <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-full overflow-hidden">
                                                        <Image
                                                            src={getAvatarImage(referral.wallet_address)}
                                                            alt={`Avatar for ${referral.wallet_address_short}`}
                                                            width={40}
                                                            height={40}
                                                            className="size-10 object-cover rounded-full"
                                                        />
                                                    </div>
                                                    {/* Info */}
                                                    <div>
                                                        <p className="text-sm font-medium text-text-body dark:text-white">
                                                            {referral.wallet_address_short}
                                                        </p>
                                                    </div>
                                                </div>
                                                {/* Amount */}
                                                <p className="text-sm font-medium text-text-secondary dark:text-white/60">
                                                    {(referral.amount ?? 0).toFixed(1)} USDC
                                                </p>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </Dialog>
            )}
        </AnimatePresence>
    );
};