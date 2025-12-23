"use client";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { type Address, type WalletClient, createWalletClient, custom } from "viem";
import { base, baseSepolia } from "viem/chains";
import { useBalance } from "../context/BalanceContext";

// ################################################
// ############## EIP7702 ACCOUNT #################
// ################################################

interface EIP7702Account {
    eoaAddress: Address | null;
    smartWalletAddress: Address | null;
    signer: WalletClient | null;
    isReady: boolean;
}

/**
 * Hook to setup EIP-7702 account with EOA and Smart Wallet
 * This creates the wallet client needed for migration
 */
export function useEIP7702Account(): EIP7702Account {
    const { user, authenticated } = usePrivy();
    const { wallets } = useWallets();
    const [account, setAccount] = useState<EIP7702Account>({
        eoaAddress: null,
        smartWalletAddress: null,
        signer: null,
        isReady: false,
    });

    useEffect(() => {
        async function setupAccount() {
            if (!user || !authenticated) {
                setAccount({
                    eoaAddress: null,
                    smartWalletAddress: null,
                    signer: null,
                    isReady: false,
                });
                return;
            }

            const embeddedWallet = wallets.find(
                (wallet) => wallet.walletClientType === "privy"
            );

            const smartWallet = user.linkedAccounts.find(
                (account) => account.type === "smart_wallet"
            );

            if (!smartWallet) {
                setAccount({
                    eoaAddress: embeddedWallet?.address as Address ?? null,
                    smartWalletAddress: null,
                    signer: null,
                    isReady: true,
                });
                return;
            }

            if (!embeddedWallet) {
                console.warn("⚠️ [EIP7702] User has smart wallet but no embedded wallet");
                return;
            }

            // ✅ Just store addresses, don't create wallet client here
            setAccount({
                eoaAddress: embeddedWallet.address as Address,
                smartWalletAddress: smartWallet.address as Address,
                signer: null, // Not needed here
                isReady: true,
            });
        }

        setupAccount();
    }, [authenticated, user?.id, wallets.length]);

    return account;
}

// ################################################
// ########## WALLET MIGRATION STATUS #############
// ################################################

interface WalletMigrationStatus {
    needsMigration: boolean;
    isChecking: boolean;
}

/**
 * Hook to check if wallet migration is needed
 * Uses real blockchain balances from useBalance
 */
export function useWalletMigrationStatus(): WalletMigrationStatus {
    const { user, authenticated } = usePrivy();
    const { allBalances, isLoading: isBalanceLoading } = useBalance();
    const [needsMigration, setNeedsMigration] = useState(false);
    const [isChecking, setIsChecking] = useState(true);

    useEffect(() => {
        async function checkMigrationStatus() {
            if (!authenticated || !user) {
                setNeedsMigration(false);
                setIsChecking(false);
                return;
            }

            // Check if user has smart wallet
            const smartWallet = user.linkedAccounts.find(
                (account) => account.type === "smart_wallet"
            );

            if (!smartWallet) {
                console.log("✅ [Migration] No smart wallet - no migration needed");
                setNeedsMigration(false);
                setIsChecking(false);
                return;
            }

            // Wait for balances to load
            if (isBalanceLoading) {
                return;
            }

            // ✅ Get balance directly from useBalance hook
            const smartWalletBalance = allBalances.smartWallet?.total ?? 0;


            // If no balance, no need to migrate
            if (smartWalletBalance <= 0) {
                setNeedsMigration(false);
                setIsChecking(false);
                return;
            }

            // Check if already migrated in database
            try {
                const response = await fetch(`/api/v1/wallets/migration-status?userId=${user.id}`);

                if (response.ok) {
                    const data = await response.json();
                    const alreadyMigrated = data.migrationCompleted ?? false;

                    const shouldMigrate = !alreadyMigrated;

                    setNeedsMigration(shouldMigrate);
                } else {
                    // If can't check, assume migration needed (safer)
                    setNeedsMigration(true);
                }
            } catch (error) {
                // On error, assume migration needed if there's balance
                setNeedsMigration(true);
            }

            setIsChecking(false);
        }

        checkMigrationStatus();
    }, [authenticated, user?.id, allBalances.smartWallet?.total, isBalanceLoading]);

    return { needsMigration, isChecking };
}