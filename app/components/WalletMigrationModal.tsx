"use client";
import React, { useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Dialog, DialogPanel } from "@headlessui/react";
import { Cancel01Icon } from "hugeicons-react";
import WalletTransferApprovalModal from "./WalletTransferApprovalModal";

interface WalletMigrationModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const WalletMigrationModal: React.FC<WalletMigrationModalProps> = ({
    isOpen,
    onClose,
}) => {
    const [showTransferModal, setShowTransferModal] = useState(false);

    const handleApproveMigration = () => {
        onClose();
        setTimeout(() => {
            setShowTransferModal(true);
        }, 300);
    };

    const handleCloseTransferModal = () => {
        setShowTransferModal(false);
    };

    return (
        <>
            <AnimatePresence>
                {isOpen && (
                    <Dialog
                        key="wallet-migration-modal"
                        open={isOpen}
                        onClose={onClose}
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
                                transition={{
                                    type: "spring",
                                    stiffness: 300,
                                    damping: 30,
                                }}
                                className="w-full"
                            >
                                <DialogPanel
                                    className="relative mx-auto w-full max-w-md sm:max-w-[28rem]"
                                >
                                    <motion.div
                                        layout
                                        initial={false}
                                        className="relative overflow-hidden rounded-t-[30px] bg-white sm:rounded-3xl dark:bg-neutral-900"
                                    >
                                        <div
                                            className="relative h-20 w-full"
                                            style={{
                                                background:
                                                    "linear-gradient(to right,rgb(116, 112, 13),rgb(22, 77, 129),rgb(54, 30, 100))",
                                            }}
                                        >
                                            <button
                                                onClick={onClose}
                                                className="absolute right-4 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full text-white transition-colors hover:bg-white/20"
                                                aria-label="Close modal"
                                            >
                                                <Cancel01Icon className="h-5 w-5" />
                                            </button>
                                        </div>

                                        {/* Content */}
                                        <div className="relative -mt-6 w-full rounded-t-[24px] overflow-y-auto bg-white p-5 pt-8 text-lg text-text-body sm:max-h-[90vh] dark:bg-[#2C2C2C] dark:text-white">
                                            <h2
                                                className="mb-3 text-xl font-semibold"
                                                style={{
                                                    background: "linear-gradient(107.4deg, #04FF44 9.42%, #EAAB12 36.67%, rgba(255, 107, 144, 0.6) 73.59%, #FF0087 92.55%, #5189F9 133.3%)",
                                                    WebkitBackgroundClip: "text",
                                                    WebkitTextFillColor: "transparent",
                                                    backgroundClip: "text",
                                                }}
                                            >
                                                Complete your wallet upgrade
                                            </h2>

                                            {/* <div className="mb-3 text-sm font-medium text-text-secondary dark:text-white/50">
                                                Chibie
                                            </div>

                                            <div className="mb-6 flex items-start gap-3 ">
                                                <div className="flex-shrink-0">
                                                    <div className="h-8 w-8 overflow-hidden">
                                                        <Image
                                                            src="/images/chibie-avatar.png"
                                                            alt="Chibie"
                                                            width={40}
                                                            height={40}
                                                            className="h-full w-full object-cover "
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex-1">
                                                    <div className="w-[60%] sm:w-[52%] rounded-2xl rounded-bl-sm bg-accent-gray px-4 py-2 text-sm font-normal text-text-body dark:bg-neutral-700 dark:text-white/90">
                                                        Hello, we are migrating!
                                                    </div>
                                                </div>
                                            </div> */}

                                            {/* Migration Overview */}
                                            <div className="rounded-[20px] bg-accent-gray p-4 mb-6 dark:bg-[#373636]">
                                                <p
                                                    className="font-[Inter] text-sm font-normal leading-5 tracking-normal text-text-body px-2 pb-4 align-middle dark:text-[#FFFFFFCC]"
                                                    style={{ fontStyle: "normal", verticalAlign: "middle" }}
                                                >
                                                    Your wallet address has been updated to give you more flexibility. After this migration, you&apos;ll be able to export your wallet and view your balance in MetaMask or any other wallet app.
                                                </p>
                                                <p
                                                    className="font-[Inter] text-sm font-normal leading-5 tracking-normal text-text-body px-2 pb-4 align-middle dark:text-[#FFFFFFCC]"
                                                    style={{ fontStyle: "normal", verticalAlign: "middle" }}
                                                >
                                                    We&apos;ll transfer your funds from your previous address to your new address. This is a one-time process.
                                                </p>

                                                <p className="text-sm font-bold leading-5 tracking-normal text-text-body px-2 mb-3 align-middle dark:text-[#FFFFFFCC]">
                                                    What you&apos;re getting:
                                                </p>
                                                <div className="rounded-[20px] bg-white px-4 py-3 mb-4 dark:bg-[#3d3d3d] space-y-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center">
                                                            <Image
                                                                src="/images/sent.png"
                                                                alt="Export wallet"
                                                                width={32}
                                                                height={32}
                                                                className="h-8 w-8 object-contain"
                                                            />
                                                        </div>
                                                        <p className="text-sm font-normal leading-5 tracking-normal text-text-body min-w-0 dark:text-white/90">
                                                            Ability to export your wallet
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center">
                                                            <Image
                                                                src="/images/wallet.png"
                                                                alt="Use balance in MetaMask or other platforms"
                                                                width={32}
                                                                height={32}
                                                                className="h-8 w-8 object-contain"
                                                            />
                                                        </div>
                                                        <p className="text-sm font-normal leading-5 tracking-normal text-text-body min-w-0 dark:text-white/90">
                                                            Use your balance in MetaMask or other platforms
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center">
                                                            <Image
                                                                src="/images/locked.png"
                                                                alt="Same security, more control"
                                                                width={32}
                                                                height={32}
                                                                className="h-8 w-8 object-contain"
                                                            />
                                                        </div>
                                                        <p className="text-sm font-normal leading-5 tracking-normal text-text-body min-w-0 dark:text-white/90">
                                                            Same security, more control
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Call to Action Explanation */}
                                                <p className="text-sm font-normal leading-5 tracking-normal text-text-body align-middle dark:text-[#FFFFFFCC]">
                                                    All you have to do is approve both actions and we will do all the heavy lifting for you
                                                </p>
                                            </div>

                                            {/* Approve Migration Button */}
                                            <button
                                                onClick={handleApproveMigration}
                                                className="w-full rounded-xl bg-lavender-500 px-6 py-3.5 text-sm font-semibold text-white transition-all hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-white active:opacity-80 dark:focus:ring-offset-neutral-900"
                                            >
                                                Approve Transfer
                                            </button>
                                        </div>
                                    </motion.div>
                                </DialogPanel>
                            </motion.div>
                        </div>
                    </Dialog>
                )}
            </AnimatePresence>

            <WalletTransferApprovalModal
                isOpen={showTransferModal}
                onClose={handleCloseTransferModal}
            />
        </>
    );
};

export default WalletMigrationModal;

