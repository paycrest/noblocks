"use client";
import { useWalletMigrationStatus } from "../hooks/useEIP7702Account";
import { WalletMigrationBanner } from "../components/WalletMigrationBanner";
import { MigrationZeroBalanceModal } from "../components/MigrationZeroBalanceModal";

export const MigrationBannerWrapper = () => {
    const { needsMigration, isChecking, showZeroBalanceMessage, isRemainingFundsMigration } = useWalletMigrationStatus();

    if (isChecking) return null;
    if (needsMigration) return <WalletMigrationBanner isRemainingFundsMigration={isRemainingFundsMigration} />;
    if (showZeroBalanceMessage) return <MigrationZeroBalanceModal showZeroBalanceMessage={showZeroBalanceMessage} />;
    return null;
};