"use client";
import { useWalletMigrationStatus } from "../hooks/useEIP7702Account";
import { WalletMigrationBanner } from "../components";
import { MigrationZeroBalanceModal } from "../components/MigrationZeroBalanceModal";

export const MigrationBannerWrapper = () => {
    const { needsMigration, isChecking, showZeroBalanceMessage } = useWalletMigrationStatus();

    if (isChecking) return null;
    if (needsMigration) return <WalletMigrationBanner />;
    if (showZeroBalanceMessage) return <MigrationZeroBalanceModal showZeroBalanceMessage={showZeroBalanceMessage} />;
    return null;
};