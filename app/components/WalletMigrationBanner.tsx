"use client";
import Image from "next/image";
import React, { useState } from "react";
import { motion } from "framer-motion";
import WalletMigrationModal from "./WalletMigrationModal";

const MIGRATION_DEADLINE = new Date("2026-02-28");

interface WalletMigrationBannerProps {
    isRemainingFundsMigration?: boolean;
}

export const WalletMigrationBanner = ({ isRemainingFundsMigration = false }: WalletMigrationBannerProps) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const isMigrationMandatory = new Date() >= MIGRATION_DEADLINE;

    const handleStartMigration = () => {
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
    };

    return (
        <>
            <motion.div
                className="fixed left-0 right-0 top-16 z-10 mt-1 hidden h-16 w-full items-center bg-[#2D77E2] sm:flex"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
            >
                <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between px-4 py-4 lg:px-8">
                    <div className="flex items-center gap-3">
                        <div className="flex-shrink-0">
                            <Image
                                src="/images/desktop-eip-migration.png"
                                alt="Migration Illustration"
                                width={120}
                                height={80}
                                priority
                                className="h-auto w-auto"
                            />
                        </div>

                        <div className="flex flex-col items-start justify-center gap-1 text-left text-sm font-medium leading-tight text-white/80">
                            <span className="block text-base font-bold leading-6 text-white/80">
                                {isRemainingFundsMigration
                                    ? "You have funds left in your previous wallet."
                                    : "Your wallet address has been updated."}
                            </span>
                            <span className="block text-sm font-medium leading-[21px] text-white/80">
                                {isRemainingFundsMigration
                                    ? "Transfer your remaining funds to your new wallet."
                                    : (
                                        <>
                                            You can now export your wallet and use it with MetaMask or other platforms.{" "}
                                            {isMigrationMandatory ? (
                                                "Migration is now mandatory."
                                            ) : (
                                                <>
                                                    Migration will be mandatory after{" "}
                                                    <span className="font-semibold text-white">
                                                        28th February 2026.
                                                    </span>
                                                </>
                                            )}{" "}
                                            Start migration to transfer your funds.
                                        </>
                                    )}
                            </span>
                        </div>
                    </div>

                    <div className="flex-shrink-0">
                        <button
                            onClick={handleStartMigration}
                            className="whitespace-nowrap rounded-xl bg-white px-6 py-2.5 text-sm font-semibold text-neutral-900 transition-all hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-[#2D77E2] active:bg-white/80"
                        >
                            {isRemainingFundsMigration ? "Complete migration" : "Start migration"}
                        </button>
                    </div>
                </div>
            </motion.div>

            <motion.div
                className="fixed left-0 right-0 top-16 z-10 mt-1 flex w-full flex-col bg-[#2D77E2] px-5 py-4 sm:hidden"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
            >
                <div className="absolute left-0 top-0 z-0 h-full">
                    <Image
                        src="/images/mobile-eip-migration.png"
                        alt="Migration Illustration Mobile"
                        width={80}
                        height={100}
                        priority
                        className="h-40 w-auto object-contain"
                    />
                </div>

                <div className="relative z-10 mb-1 pl-4 pr-8">
                    <span className="block text-base font-bold leading-6 text-white/80">
                        {isRemainingFundsMigration
                            ? "You have funds left in your previous wallet."
                            : "Your wallet address has been updated."}
                    </span>
                    <span className="block text-sm font-medium leading-[21px] text-white/80">
                        {isRemainingFundsMigration
                            ? "Transfer your remaining funds to your new wallet."
                            : (
                                <>
                                    You can now export your wallet and use it with MetaMask or other platforms.{" "}
                                    {isMigrationMandatory ? (
                                        "Migration is now mandatory."
                                    ) : (
                                        <>
                                            Migration will be mandatory after{" "}
                                            <span className="font-semibold text-white">
                                                28th February 2026.
                                            </span>
                                        </>
                                    )}{" "}
                                    Start migration to transfer your funds.
                                </>
                            )}
                    </span>
                </div>

                <div className="relative z-10 pl-4">
                    <button
                        onClick={handleStartMigration}
                        className="rounded-xl bg-white px-8 py-3 text-base font-semibold text-neutral-900 transition-all hover:bg-white/90 active:bg-white/80"
                    >
                        {isRemainingFundsMigration ? "Complete migration" : "Start migration"}
                    </button>
                </div>
            </motion.div>

            {/* Spacer to offset fixed banner height so content is not hidden underneath */}
            <div className="h-24 sm:h-16" aria-hidden="true" />

            <WalletMigrationModal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
            />
        </>
    );
};