"use client";
import { useWalletMigrationStatus } from "../hooks/useEIP7702Account";
import { WalletMigrationBanner } from "../components";

export const MigrationBannerWrapper = () => {
    const { needsMigration, isChecking } = useWalletMigrationStatus();

    // Don't show banner while checking
    if (isChecking) {
        return null;
    }

    // Don't show banner if migration not needed
    if (!needsMigration) {
        return null;
    }

    return <WalletMigrationBanner />;
}