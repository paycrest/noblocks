"use client";
import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Dialog, DialogPanel } from "@headlessui/react";
import { toast } from "sonner";
import { ArrowLeft02Icon, Copy01Icon } from "hugeicons-react";
import { PiCheck } from "react-icons/pi";
import { getReferralData } from "../../api/aggregator";
import { usePrivy } from "@privy-io/react-auth";
import { slideUpAnimation } from "../AnimatedComponents";
// Mock data for presentation
const MOCK_DATA = {
    referral_code: "NB738K",
    total_earned: 34.9,
    total_pending: 2.0,
    total_referrals: 11,
    earned_count: 8,
    pending_count: 3,
    referrals: [
        // Pending referrals (3)
        {
            id: "1",
            wallet_address: "0x52c...b43f",
            wallet_address_short: "0x52c...b43f",
            status: "pending",
            amount: 0.5,
            created_at: "2025-06-05T10:30:00Z",
        },
        {
            id: "2",
            wallet_address: "0x52c...b43f",
            wallet_address_short: "0x52c...b43f",
            status: "pending",
            amount: 0.5,
            created_at: "2024-09-13T14:20:00Z",
        },
        {
            id: "3",
            wallet_address: "0x73a...d78f",
            wallet_address_short: "0x73a...d78f",
            status: "pending",
            amount: 0.5,
            created_at: "2024-10-31T09:15:00Z",
        },
        // Earned referrals (8)
        {
            id: "4",
            wallet_address: "0x84b...e27a",
            wallet_address_short: "0x84b...e27a",
            status: "earned",
            amount: 4.8,
            created_at: "2024-11-01T11:00:00Z",
            completed_at: "2024-11-02T15:30:00Z",
        },
        {
            id: "5",
            wallet_address: "0x92c...f15b",
            wallet_address_short: "0x92c...f15b",
            status: "earned",
            amount: 6.1,
            created_at: "2024-11-02T08:45:00Z",
            completed_at: "2024-11-03T12:20:00Z",
        },
        {
            id: "6",
            wallet_address: "0xa3d...b63c",
            wallet_address_short: "0xa3d...b63c",
            status: "earned",
            amount: 2.9,
            created_at: "2024-11-03T16:30:00Z",
            completed_at: "2024-11-04T10:15:00Z",
        },
        {
            id: "7",
            wallet_address: "0xb4e...a74d",
            wallet_address_short: "0xb4e...a74d",
            status: "earned",
            amount: 8.4,
            created_at: "2024-11-04T13:20:00Z",
            completed_at: "2024-11-05T09:45:00Z",
        },
        {
            id: "8",
            wallet_address: "0xc5f...c85e",
            wallet_address_short: "0xc5f...c85e",
            status: "earned",
            amount: 5.7,
            created_at: "2024-11-05T10:10:00Z",
            completed_at: "2024-11-06T14:30:00Z",
        },
        {
            id: "9",
            wallet_address: "0xa1b...d74f",
            wallet_address_short: "0xa1b...d74f",
            status: "earned",
            amount: 3.2,
            created_at: "2024-11-12T15:40:00Z",
            completed_at: "2024-11-13T11:20:00Z",
        },
        {
            id: "10",
            wallet_address: "0xb3e...f59c",
            wallet_address_short: "0xb3e...f59c",
            status: "earned",
            amount: 7.5,
            created_at: "2024-11-19T12:25:00Z",
            completed_at: "2024-11-20T08:50:00Z",
        },
        {
            id: "11",
            wallet_address: "0x7da...cba3",
            wallet_address_short: "0x7da...cba3",
            status: "earned",
            amount: 3.2,
            created_at: "2024-11-26T09:30:00Z",
            completed_at: "2024-11-27T16:10:00Z",
        },
    ],
};
export const ReferralDashboardView = ({
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
                if (mounted) setReferralData(MOCK_DATA);
                /* Production code (commented for demo):
                const token = await getAccessToken();
                if (!token) return;
                const data = await getReferralData(token);
                if (mounted) setReferralData(data);
                */
            } catch (error) {
                console.error("Failed to fetch referral data:", error);
                toast.error("Failed to load referral data");
            } finally {
                if (mounted) setIsLoading(false);
            }
        }
        fetchData();
        return () => {
            mounted = false;
        };
    }, [getAccessToken, isOpen]);
    const handleCopyCode = () => {
        if (referralData?.referral_code) {
            navigator.clipboard.writeText(referralData.referral_code);
            setShowCopiedMessage(true);
            setTimeout(() => setShowCopiedMessage(false), 2000);
        }
    };
    const handleCopyLink = () => {
        if (referralData?.referral_code) {
            const link = `${window.location.origin}?ref=${referralData.referral_code}`;
            navigator.clipboard.writeText(link);
            toast.success("Referral link copied!");
        }
    };
    
    const filteredReferrals: any[] = (referralData?.referrals || []).filter(
        (r: any) => r.status === activeTab
    );
    // Generate avatar colors based on wallet address
    const getAvatarColor = (address: string) => {
        const colors = [
            "from-purple-500 to-purple-600",
            "from-blue-500 to-blue-600",
            "from-cyan-500 to-cyan-600",
            "from-teal-500 to-teal-600",
            "from-orange-500 to-orange-600",
            "from-pink-500 to-pink-600",
        ];
        const index = parseInt(address.slice(2, 4), 16) % colors.length;
        return colors[index];
    };
    return (
        <AnimatePresence>
            {isOpen && (
                <Dialog
                    open={isOpen}
                    onClose={onClose}
                    className="relative z-[60] max-h-[90vh] sm:hidden"
                >
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 bg-black/30 backdrop-blur-sm"
                    />
                    <div className="fixed inset-0">
                        <div className="flex h-full items-end">
                            <motion.div {...slideUpAnimation} className="w-full">
                                <DialogPanel className="scrollbar-hide relative max-h-full w-full overflow-visible rounded-t-[30px] border border-border-light bg-white px-5 pt-6 shadow-xl *:text-sm dark:border-white/5 dark:bg-[#141414]">
                                    <AnimatePresence mode="wait">
                                        <motion.div
                                            key="referral-dashboard"
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: "auto" }}
                                            exit={{ opacity: 0, height: 0 }}
                                            transition={{
                                                height: { duration: 0.35 },
                                                opacity: { duration: 0.2 },
                                            }}
                                            style={{ overflow: "hidden" }}
                                        >
                                            <div className="scrollbar-hide max-h-[90vh] overflow-y-scroll pb-12">
                                                {/* Header */}
                                                <div className="mb-6 flex items-center gap-4">
                                                    <button
                                                        type="button"
                                                        aria-label="Close referrals"
                                                        onClick={onClose}
                                                        className="rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-white/10"
                                                    >
                                                        <ArrowLeft02Icon className="size-5 text-outline-gray dark:text-white/50" />
                                                    </button>
                                                    <h1 className="text-xl font-semibold text-text-body dark:text-white">
                                                        Referrals
                                                    </h1>
                                                </div>
                                                {/* Earnings Summary */}
                                                <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border-light dark:border-white/10 dark:bg-transparent">
                                                <div className="border-r border-border-light bg-transparent p-4 dark:border-white/10">
                                                        <p className="mb-1 text-sm text-text-secondary dark:text-white/60">
                                                            Earned
                                                        </p>
                                                        <p className="text-2xl font-semibold text-text-body dark:text-white">
                                                            {referralData?.total_earned?.toFixed(1) ?? "0.0"} USDC
                                                        </p>
                                                    </div>
                                                    <div className="bg-transparent p-4">
                                                        <p className="mb-1 text-sm text-text-secondary dark:text-white/60">
                                                            Pending
                                                        </p>
                                                        <p className="text-2xl font-semibold text-text-body dark:text-white">
                                                            {referralData?.total_pending?.toFixed(0) ?? "0"} USDC
                                                        </p>
                                                    </div>
                                                </div>
                                                {/* Referral Code Card */}
                                                <div className="mb-4 space-y-3 rounded-2xl border border-border-light bg-transparent p-4 dark:border-white/10">
                                                    <p className="text-sm text-text-secondary dark:text-white/60">
                                                        Your invite code
                                                    </p>
                                                    <div className="flex items-center justify-between">
                                                        <p className="text-2xl font-bold tracking-wider text-text-body dark:text-white">
                                                            {referralData?.referral_code || "LOADING"}
                                                        </p>
                                                        <button
                                                            onClick={handleCopyCode}
                                                            aria-pressed={showCopiedMessage}
                                                            className="flex items-center gap-1.5 rounded-lg px-3 py-2 hover:bg-gray-100 dark:hover:bg-white/10"
                                                        >
                                                            {showCopiedMessage ? (
                                                                <>
                                                                    <PiCheck className="size-4 text-emerald-500" />
                                                                    <span className="text-sm font-medium text-emerald-500">
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
                                                        onClick={handleCopyLink}
                                                        className="min-h-11 w-full rounded-xl bg-lavender-500 py-3 text-sm font-medium text-white transition-colors hover:bg-lavender-600"
                                                    >
                                                        Copy Invite Link
                                                    </button>
                                                </div>
                                                <p className="mb-6 text-sm leading-relaxed text-text-secondary dark:text-white/60">
                                                    Earn when you refer your friends. You both get $1 when they
                                                    complete their first $20 transaction.
                                                </p>
                                                {/* Tabs */}
                                                <div className="mb-4 flex gap-6 ">
                                                    <button
                                                        onClick={() => setActiveTab("pending")}
                                                        className={`relative pb-3 text-base font-medium transition-colors ${activeTab === "pending"
                                                            ? "text-text-body dark:text-white"
                                                            : "text-text-secondary dark:text-white/50"
                                                            }`}
                                                    >
                                                        Pending
                                                        {activeTab === "pending" && (
                                                            <motion.div
                                                                layoutId="activeTab"
                                                                className="absolute bottom-0 left-0 right-0 h-0.5 bg-text-body dark:bg-white"
                                                            />
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={() => setActiveTab("earned")}
                                                        className={`relative pb-3 text-base font-medium transition-colors ${activeTab === "earned"
                                                            ? "text-text-body dark:text-white"
                                                            : "text-text-secondary dark:text-white/50"
                                                            }`}
                                                    >
                                                        Earned
                                                        {activeTab === "earned" && (
                                                            <motion.div
                                                                layoutId="activeTab"
                                                                className="absolute bottom-0 left-0 right-0 h-0.5 bg-text-body dark:bg-white"
                                                            />
                                                        )}
                                                    </button>
                                                </div>
                                                {/* Referral List */}
                                                <div className="space-y-3">
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
                                                                className="flex items-center justify-between py-1"
                                                            >
                                                                <div className="flex items-center gap-3">
                                                                    {/* Avatar */}
                                                                    <div
                                                                        className={`flex size-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${getAvatarColor(referral.wallet_address)}`}
                                                                    >
                                                                        <span className="text-sm font-semibold text-white">
                                                                            {referral.wallet_address_short
                                                                                .slice(2, 4)
                                                                                .toUpperCase()}
                                                                        </span>
                                                                    </div>
                                                                    {/* Info */}
                                                                    <div>
                                                                        <p className="text-sm font-medium text-text-body dark:text-white">
                                                                            {referral.wallet_address_short}
                                                                        </p>
                                                                        {/* <p className="text-xs text-text-secondary dark:text-white/60">
                                                                            {new Date(referral.created_at).toLocaleDateString(
                                                                                "en-US",
                                                                                {
                                                                                    day: "2-digit",
                                                                                    month: "short",
                                                                                    year: "numeric",
                                                                                }
                                                                            )}
                                                                        </p> */}
                                                                    </div>
                                                                </div>
                                                                {/* Amount */}
                                                                <p className="text-sm font-medium text-text-secondary dark:text-white/60">
                                                                    {referral.amount.toFixed(1)} USDC
                                                                </p>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        </motion.div>
                                    </AnimatePresence>
                                </DialogPanel>
                            </motion.div>
                        </div>
                    </div>
                </Dialog>
            )}
        </AnimatePresence>
    );
};