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
    onApprove: () => void;
}

const WalletMigrationModal: React.FC<WalletMigrationModalProps> = ({
    isOpen,
    onClose,
    onApprove,
}) => {
    const [showTransferModal, setShowTransferModal] = useState(false);

    const handleApproveMigration = () => {
        onClose(); // Close first modal
        // Small delay to allow first modal to close before opening second
        setTimeout(() => {
            setShowTransferModal(true);
        }, 300);
    };

    const handleCloseTransferModal = () => {
        setShowTransferModal(false);
    };

    const handleApproveTransfer = () => {
        setShowTransferModal(false);
        onApprove();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <Dialog open={isOpen} onClose={onClose} className="relative z-50">
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
                                    {/* Gradient Header */}
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
                                            A short letter from us to you!
                                        </h2>

                                        {/* Chibie Name */}
                                        <div className="mb-3 text-sm font-medium text-text-secondary dark:text-white/50">
                                            Chibie
                                        </div>

                                        {/* Chat-like Introduction */}
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
                                        </div>

                                        {/* Migration Overview */}
                                        <div className="rounded-[20px] bg-accent-gray p-4 mb-6 dark:bg-[#373636]">
                                            <p className="text-sm leading-relaxed text-text-body px-2 pb-4 dark:text-white/90">
                                                We're upgrading to a faster, more secure
                                                wallet powered by{" "}
                                                <span className="font-semibold">
                                                    Thirdweb
                                                </span>
                                                . What does this mean?
                                            </p>

                                            {/* KYC Migration Section */}
                                            <div className="rounded-[20px] bg-white p-1 py-3 mb-4 dark:bg-[#3d3d3d]">
                                                <div className="flex items-start mb-3">
                                                    <div className="flex-shrink-0">
                                                        <div className="flex h-12 w-12 items-center justify-center rounded-lg">
                                                            <Image
                                                                src="/images/finger-print-scan.png"
                                                                alt="KYC Migration"
                                                                width={32}
                                                                height={32}
                                                                className="h-8 w-8 object-contain opacity-100"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="text-sm leading-relaxed text-text-body dark:text-white/90">
                                                            Your KYC will be moved from{" "}
                                                            <span className="font-semibold">
                                                                Privy
                                                            </span>{" "}
                                                            to a new wallet address assigned by{" "}
                                                            <span className="font-semibold">
                                                                Thirdweb
                                                            </span>
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Funds Transfer Section */}
                                                <div className="flex items-start">
                                                    <div className="flex-shrink-0">
                                                        <div className="flex h-12 w-12 items-center justify-center rounded-lg">
                                                            <Image
                                                                src="/images/wallet.png"
                                                                alt="Funds Transfer"
                                                                width={32}
                                                                height={32}
                                                                className="h-8 w-8 object-contain opacity-70"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="text-sm leading-relaxed text-text-body dark:text-white/90">
                                                            If you have any funds in your account,
                                                            it will be transferred to your new
                                                            KYCed address
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Call to Action Explanation */}
                                            <p className="text-sm leading-relaxed text-text-body dark:text-white/90">
                                                All you have to do is approve both actions and
                                                we will do all the heavy liftings for you
                                            </p>
                                        </div>

                                        {/* Approve Migration Button */}
                                        <button
                                            onClick={handleApproveMigration}
                                            className="w-full rounded-xl bg-lavender-500 px-6 py-3.5 text-sm font-semibold text-white transition-all hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-white active:opacity-80 dark:focus:ring-offset-neutral-900"
                                        >
                                            Approve migration
                                        </button>
                                    </div>
                                </motion.div>
                            </DialogPanel>
                        </motion.div>
                    </div>
                </Dialog>
            )}

            {/* Wallet Transfer Approval Modal */}
            <WalletTransferApprovalModal
                isOpen={showTransferModal}
                onClose={handleCloseTransferModal}
                onApprove={handleApproveTransfer}
            />
        </AnimatePresence>
    );
};

export default WalletMigrationModal;

