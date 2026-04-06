"use client";

import { useEffect, useState } from "react";
import { useWalletMigrationStatus } from "../hooks/useEIP7702Account";
import { WalletMigrationBanner } from "../components/WalletMigrationBanner";
import { MigrationZeroBalanceModal } from "../components/MigrationZeroBalanceModal";
import { usePrivy } from "@privy-io/react-auth";
import { useInjectedWallet } from "./InjectedWalletContext";
import { useIsNetworkModalDismissed } from "../lib/networkModalStore";

const NETWORK_MODAL_STORAGE_KEY_PREFIX = "hasSeenNetworkModal-";

function hasSeenNetworkModal(walletAddress: string | undefined): boolean {
    if (typeof window === "undefined" || !walletAddress) return false;
    const key = `${NETWORK_MODAL_STORAGE_KEY_PREFIX}${walletAddress.toLowerCase()}`;
    return localStorage.getItem(key) === "true";
}

export const MigrationBannerWrapper = () => {
    const { user } = usePrivy();
    const { isInjectedWallet } = useInjectedWallet();
    const { needsMigration, isChecking, showZeroBalanceMessage, isRemainingFundsMigration, refetchMigrationStatus } = useWalletMigrationStatus();
    const [stableVisibility, setStableVisibility] = useState({
        needsMigration: false,
        showZeroBalanceMessage: false,
        isRemainingFundsMigration: false,
    });

    const walletAddress = user?.wallet?.address;

    // Live: useSyncExternalStore re-renders the instant NetworkSelectionModal calls markNetworkModalDismissed()
    const dismissedViaStore = useIsNetworkModalDismissed();
    // Fallback: covers page-reload when localStorage already has the key
    const dismissedViaStorage = hasSeenNetworkModal(walletAddress);

    const canShowMigrationModal = isInjectedWallet || dismissedViaStore || dismissedViaStorage;

    // Keep the last stable visibility while loading to avoid unmounting migration modals mid-flow.
    useEffect(() => {
        if (!isChecking) {
            setStableVisibility({
                needsMigration,
                showZeroBalanceMessage,
                isRemainingFundsMigration,
            });
        }
    }, [isChecking, needsMigration, showZeroBalanceMessage, isRemainingFundsMigration]);

    const visibleNeedsMigration = isChecking ? stableVisibility.needsMigration : needsMigration;
    const visibleShowZeroBalance = isChecking ? stableVisibility.showZeroBalanceMessage : showZeroBalanceMessage;
    const visibleRemainingFundsMigration = isChecking
        ? stableVisibility.isRemainingFundsMigration
        : isRemainingFundsMigration;

    if (visibleNeedsMigration && canShowMigrationModal) {
        return <WalletMigrationBanner isRemainingFundsMigration={visibleRemainingFundsMigration} />;
    }
    if (visibleShowZeroBalance && canShowMigrationModal) {
        return (
            <MigrationZeroBalanceModal
                showZeroBalanceMessage={visibleShowZeroBalance}
                onAcknowledged={refetchMigrationStatus}
            />
        );
    }
    return null;
};