"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogPanel } from "@headlessui/react";
import { Cancel01Icon } from "hugeicons-react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { triggerMigrationStatusRefetch } from "../hooks/useEIP7702Account";
import { useBalance } from "../context/BalanceContext";

const STORAGE_KEY_PREFIX = "hasDismissedZeroBalanceMigration-";

interface MigrationZeroBalanceModalProps {
    showZeroBalanceMessage: boolean;
    /** Called after user clicks "I understand"; use to deprecate SCW in DB and refetch migration status */
    onAcknowledged?: () => void;
}

export const MigrationZeroBalanceModal: React.FC<MigrationZeroBalanceModalProps> = ({
    showZeroBalanceMessage,
    onAcknowledged,
}) => {
    const { user, getAccessToken } = usePrivy();
    const { wallets } = useWallets();
    const { refreshBalance } = useBalance();
    const [dismissed, setDismissed] = useState(false);
    const [hasCheckedStorage, setHasCheckedStorage] = useState(false);
    const [isDeprecating, setIsDeprecating] = useState(false);

    const userId = user?.id ?? user?.wallet?.address;
    const storageKey = userId ? `${STORAGE_KEY_PREFIX}${userId}` : null;

    // Reset check state when storage key changes (user loads)
    useEffect(() => {
        if (storageKey) {
            setHasCheckedStorage(false);
        }
    }, [storageKey]);

    useEffect(() => {
        if (storageKey && !hasCheckedStorage) {
            const alreadyDismissed = localStorage.getItem(storageKey);
            if (alreadyDismissed === "true") {
                setDismissed(true);
            }
            setHasCheckedStorage(true);
        }
    }, [storageKey, hasCheckedStorage]);

    const handleClose = async () => {
        if (isDeprecating) return;
        const smartWallet = user?.linkedAccounts?.find((a) => a.type === "smart_wallet");
        const embeddedWallet = wallets?.find((w) => w.walletClientType === "privy");
        if (user?.id && smartWallet?.address && embeddedWallet?.address && getAccessToken && onAcknowledged) {
            setIsDeprecating(true);
            try {
                const accessToken = await getAccessToken();
                if (accessToken) {
                    const res = await fetch("/api/v1/wallets/deprecate", {
                        method: "POST",
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            "x-wallet-address": embeddedWallet.address,
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            oldAddress: smartWallet.address,
                            newAddress: embeddedWallet.address,
                            userId: user.id,
                            txHash: null,
                        }),
                    });
                    if (res.ok) {
                        onAcknowledged();
                        triggerMigrationStatusRefetch();
                        refreshBalance();
                    }
                }
            } catch {
                // Still dismiss modal and persist to storage; user can retry or support can fix
            } finally {
                setIsDeprecating(false);
            }
        }
        if (storageKey) {
            localStorage.setItem(storageKey, "true");
        }
        setDismissed(true);
    };

    const isOpen = showZeroBalanceMessage && !dismissed && hasCheckedStorage;

    if (!hasCheckedStorage) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <Dialog
                    open={isOpen}
                    onClose={handleClose}
                    className="relative z-50"
                >
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="fixed inset-0 bg-black/25 backdrop-blur-sm dark:bg-black/40"
                    />

                    <div className="fixed inset-0 flex w-screen items-end sm:items-center sm:justify-center sm:p-4">
                        <motion.div
                            initial={{ y: "100%", opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: "100%", opacity: 0 }}
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            className="w-full"
                        >
                            <DialogPanel className="relative mx-auto w-full max-w-md sm:max-w-[28rem]">
                                <motion.div
                                    layout
                                    initial={false}
                                    className="relative overflow-hidden rounded-t-[30px] bg-white sm:rounded-3xl dark:bg-[#2C2C2C]"
                                >
                                    {/* Gradient header */}
                                    <div
                                        className="relative h-20 w-full"
                                        style={{
                                            background:
                                                "linear-gradient(to right,rgb(116, 112, 13),rgb(22, 77, 129),rgb(54, 30, 100))",
                                        }}
                                    >
                                        <button
                                            onClick={handleClose}
                                            className="absolute right-4 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full text-white transition-colors hover:bg-white/20"
                                            aria-label="Close modal"
                                        >
                                            <Cancel01Icon className="h-5 w-5" />
                                        </button>
                                    </div>

                                    {/* Content */}
                                    <div className="relative -mt-6 w-full overflow-y-auto rounded-t-[24px] bg-white p-5 pt-8 text-text-body sm:max-h-[90vh] dark:bg-[#373737] dark:text-white">
                                        <h2
                                            className="mb-6 text-xl font-semibold"
                                            style={{
                                                background:
                                                    "linear-gradient(107.4deg, #04FF44 9.42%, #EAAB12 36.67%, rgba(255, 107, 144, 0.6) 73.59%, #FF0087 92.55%, #5189F9 133.3%)",
                                                WebkitBackgroundClip: "text",
                                                WebkitTextFillColor: "transparent",
                                                backgroundClip: "text",
                                            }}
                                        >
                                            Your wallet is now exportable
                                        </h2>

                                        <div className="mb-4 space-y-4">
                                            <div className="rounded-[20px] bg-accent-gray p-4 dark:bg-[#2C2C2C]">
                                                <p
                                                    className="font-[Inter] text-sm font-light leading-5 tracking-normal text-text-body dark:text-[#FFFFFFCC]"
                                                    
                                                >
                                                    Your address has been updated. This means you can now export your
                                                    wallet and use it across different platforms like MetaMask.
                                                </p>
                                            </div>
                                            <div className="rounded-[20px] bg-accent-gray p-4 dark:bg-[#2C2C2C]">
                                                <p
                                                    className="font-[Inter] text-sm font-light leading-5 tracking-normal text-text-body dark:text-[#FFFFFFCC]"
                                                >
                                                    Note: If you&apos;ve saved or shared your wallet address elsewhere,
                                                    make sure to update it to your new wallet address.
                                                </p>
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={handleClose}
                                            disabled={isDeprecating}
                                            className="w-full rounded-xl bg-lavender-500 px-6 py-3.5 text-sm font-medium text-white transition-all hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-white active:opacity-80 disabled:opacity-70 dark:focus:ring-offset-neutral-900"
                                        >
                                            {isDeprecating ? "Saving…" : "I understand"}
                                        </button>
                                    </div>
                                </motion.div>
                            </DialogPanel>
                        </motion.div>
                    </div>
                </Dialog>
            )}
        </AnimatePresence>
    );
};
