"use client";
import React from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Dialog, DialogPanel } from "@headlessui/react";
import { Cancel01Icon, CheckmarkCircle01Icon } from "hugeicons-react";

interface WalletMigrationSuccessModalProps {
    isOpen: boolean;
    onClose: () => void;
    onContinue: () => void;
}

const WalletMigrationSuccessModal: React.FC<WalletMigrationSuccessModalProps> = ({
    isOpen,
    onClose,
    onContinue,
}) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <Dialog
                    key="wallet-migration-success-modal"
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
                            <DialogPanel className="relative mx-auto w-full max-w-md sm:max-w-[28rem]">
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

                                    <div className="relative -mt-6 w-full rounded-t-[24px] overflow-y-auto bg-white p-5 pt-8 text-lg text-text-body sm:max-h-[90vh] dark:bg-[#2C2C2C] dark:text-white">
                                        <div className=" flex items-center justify-center mb-6">
                                            <CheckmarkCircle01Icon className="w-24 h-24 text-[#39C65D]" strokeWidth={1} />
                                        </div>

                                        <h2 className="mb-4 text-center text-xl font-semibold text-text-body dark:text-white">
                                            Migration successful
                                        </h2>
                                        <p className="mb-8 text-center text-sm font-normal leading-relaxed text-text-body/90 dark:text-white/90">
                                            You can now continue converting your crypto to <br /> fiats at zero fees on noblocks
                                        </p>
                                        <button
                                            onClick={onContinue}
                                            className="w-full rounded-xl bg-lavender-500 px-6 py-3.5 text-sm font-medium text-white transition-all hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-white active:opacity-80 dark:focus:ring-offset-neutral-900"
                                        >
                                            Let's go!
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

export default WalletMigrationSuccessModal;
