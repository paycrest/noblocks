"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogPanel } from "@headlessui/react";
import { Cancel01Icon } from "hugeicons-react";
import { usePrivy } from "@privy-io/react-auth";

const STORAGE_KEY_PREFIX = "hasDismissedZeroBalanceMigration-";

interface MigrationZeroBalanceModalProps {
    showZeroBalanceMessage: boolean;
}

export const MigrationZeroBalanceModal: React.FC<MigrationZeroBalanceModalProps> = ({
    showZeroBalanceMessage,
}) => {
    const { user } = usePrivy();
    const [dismissed, setDismissed] = useState(false);
    const [hasCheckedStorage, setHasCheckedStorage] = useState(false);

    const userId = user?.wallet?.address ?? user?.id;
    const storageKey = userId ? `${STORAGE_KEY_PREFIX}${userId}` : null;

    useEffect(() => {
        if (!hasCheckedStorage) {
            if (storageKey) {
                const alreadyDismissed = localStorage.getItem(storageKey);
                if (alreadyDismissed === "true") {
                    setDismissed(true);
                }
            }
            setHasCheckedStorage(true);
        }
    }, [hasCheckedStorage, storageKey]);

    const handleClose = () => {
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
                                    <div className="relative -mt-6 w-full overflow-y-auto rounded-t-[24px] bg-white p-5 pt-8 text-text-body sm:max-h-[90vh] dark:bg-[#2C2C2C] dark:text-white">
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
                                            <div className="rounded-[20px] bg-accent-gray p-4 dark:border dark:border-white/10 dark:bg-white/5">
                                                <p
                                                    className="font-[Inter] text-sm font-normal leading-5 tracking-normal text-text-body dark:text-[#FFFFFFCC]"
                                                    style={{ fontStyle: "normal", verticalAlign: "middle" }}
                                                >
                                                    Your address has been updated. This means you can now export your
                                                    wallet and use it across different platforms like MetaMask.
                                                </p>
                                            </div>
                                            <div className="rounded-[20px] bg-accent-gray p-4 dark:border dark:border-white/10 dark:bg-white/5">
                                                <p
                                                    className="font-[Inter] text-sm font-normal leading-5 tracking-normal text-text-body dark:text-[#FFFFFFCC]"
                                                    style={{ fontStyle: "normal", verticalAlign: "middle" }}
                                                >
                                                    Note: If you&apos;ve saved or shared your wallet address elsewhere,
                                                    make sure to update it to your new wallet address.
                                                </p>
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={handleClose}
                                            className="w-full rounded-xl bg-lavender-500 px-6 py-3.5 text-sm font-semibold text-white transition-all hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-white active:opacity-80 dark:focus:ring-offset-neutral-900"
                                        >
                                            I understand
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
