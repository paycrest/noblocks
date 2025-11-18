"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useRouter } from "next/navigation";

export const ReferralCTA = ({ onViewReferrals }: { onViewReferrals?: () => void }) => {
    const router = useRouter();

    const handleViewReferrals = () => {
        if (onViewReferrals) return onViewReferrals();
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="w-full space-y-3 rounded-2xl border border-border-light bg-transparent p-4 dark:border-white/10"
        >
            <div className="flex items-center gap-3">
                <div className="flex size-10 flex-shrink-0 border border-border-light/5 bg-gray-50 items-center justify-center rounded-xl dark:bg-white/5 dark:text-white">
                    <Image
                        src="/images/referral-cta-dollar.png"
                        alt="Referral"
                        width={20}
                        height={20}
                        className="size-4"
                    />
                </div>

                <div className="flex-1">
                    <h3 className="text-sm font-semibold text-text-body dark:text-white mb-2">
                        Invite. Earn. Repeat.
                    </h3>
                    <p className="font-light text-text-secondary dark:text-white/50">
                        Refer your friends and earn USDT
                    </p>
                </div>
            </div>

            <button
                type="button"
                onClick={handleViewReferrals}
                className="min-h-11 w-full rounded-xl bg-accent-gray py-2.5 text-sm font-medium text-gray-900 transition-colors hover:bg-accent-gray/80 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            >
                View referrals
            </button>
        </motion.div>
    );
};