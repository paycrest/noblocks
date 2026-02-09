"use client";
import { usePrivy, useWallets, useSign7702Authorization } from "@privy-io/react-auth";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    type Address,
    type Chain,
    type PublicClient,
    SignedAuthorization,
    createPublicClient,
    http,
} from "viem";
import { useBalance } from "../context/BalanceContext";
import config from "../lib/config";

// ################################################
// ########## EIP-7702 LIB HELPERS ################
// ################################################

/** EIP-7702 magic prefix: authorized EOA bytecode starts with this. */
export const EIP7702_MAGIC_PREFIX = "0xef0100";

/**
 * Parse the authorized implementation address from EOA bytecode (eth_getCode).
 * Under EIP-7702, authorized EOAs expose bytecode starting with 0xef0100 followed by the 20-byte implementation address.
 */
export function parseEip7702AuthorizedAddress(
    code: string | null | undefined
): Address | null {
    if (!code || code === "0x" || code === "0x0") return null;
    const normalized = code.toLowerCase();
    const idx = normalized.indexOf(EIP7702_MAGIC_PREFIX);
    if (idx === -1) return null;
    return `0x${normalized.slice(idx + EIP7702_MAGIC_PREFIX.length, idx + EIP7702_MAGIC_PREFIX.length + 40)}` as Address;
}

/**
 * Detect whether an EOA is delegated via EIP-7702 and return the implementation address.
 */
export async function get7702ImplementationAddress(
    publicClient: PublicClient,
    address: Address
): Promise<Address | null> {
    const code = await publicClient.getCode({ address });
    return parseEip7702AuthorizedAddress(code ?? undefined);
}

/**
 * Get the EIP-7702 authorized implementation address for an EOA on a given chain.
 * Creates a public client and runs getCode + parse. Use when you don't have a PublicClient.
 */
export async function get7702AuthorizedImplementationForAddress(
    chain: Chain,
    rpcUrl: string,
    address: Address
): Promise<Address | null> {
    const publicClient = createPublicClient({
        chain,
        transport: http(rpcUrl),
    });
    return get7702ImplementationAddress(publicClient, address);
}

// ################################################
// ########## MIGRATION STATUS HOOK ###############
// ################################################

interface MigrationStatus {
    isMigrationComplete: boolean;
    isLoading: boolean;
}

/**
 * Hook to check if wallet migration is complete
 * Returns the migration completion status from the API
 */
export function useMigrationStatus(): MigrationStatus {
    const { user, getAccessToken } = usePrivy();
    const [isMigrationComplete, setIsMigrationComplete] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function checkMigration() {
            if (!user?.id) {
                setIsLoading(false);
                return;
            }

            try {
                const accessToken = await getAccessToken();
                if (!accessToken) {
                    console.warn("No access token available for migration status check");
                    setIsMigrationComplete(false);
                    return;
                }

                const response = await fetch(`/api/v1/wallets/migration-status?userId=${user.id}`, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    setIsMigrationComplete(data.migrationCompleted ?? false);
                } else {
                    console.error("Migration status API error:", response.status, response.statusText);
                    setIsMigrationComplete(false);
                }
            } catch (error) {
                console.error("Error checking migration status:", error);
                setIsMigrationComplete(false);
            } finally {
                setIsLoading(false);
            }
        }

        checkMigration();
    }, [user?.id]);

    return { isMigrationComplete, isLoading };
}

// ################################################
// ########## SHOULD USE EOA (NAV + ACTIONS) ######
// ################################################

/**
 * True when the app should use the embedded wallet (EOA) for nav, balance, createOrder, transfer.
 * True if: migrated in DB, OR has smart wallet with 0 balance (treat as EOA without DB migration).
 * During balance load we return the last known value so 0-balance users don't see SCW address flicker.
 */
export function useShouldUseEOA(): boolean {
    const { user } = usePrivy();
    const { isMigrationComplete } = useMigrationStatus();
    const { allBalances, isLoading: isBalanceLoading } = useBalance();
    const lastValueRef = useRef<boolean | null>(null);

    const hasSmartWallet = !!user?.linkedAccounts?.find((a) => a.type === "smart_wallet");
    const smartWalletBalance = allBalances.smartWallet?.total ?? 0;

    if (isMigrationComplete) {
        lastValueRef.current = true;
        return true;
    }
    if (!hasSmartWallet) {
        lastValueRef.current = false;
        return false;
    }
    // During load, keep last value to avoid SCW→EOA flicker on refresh; first load prefer EOA if they have smart wallet
    if (isBalanceLoading) return lastValueRef.current ?? hasSmartWallet;
    const value = smartWalletBalance === 0;
    lastValueRef.current = value;
    return value;
}

// ################################################
// ########## WALLET MIGRATION STATUS #############
// ################################################

interface WalletMigrationStatus {
    needsMigration: boolean;
    isChecking: boolean;
    showZeroBalanceMessage: boolean;
}

/**
 * Hook to check if wallet migration is needed
 * - needsMigration: show full "Start migration" banner (has funds in SCW, not migrated)
 * - showZeroBalanceMessage: show short text only (0 balance SCW; nav/actions use EOA)
 */
export function useWalletMigrationStatus(): WalletMigrationStatus {
    const { user, authenticated, getAccessToken } = usePrivy();
    const { allBalances, isLoading: isBalanceLoading } = useBalance();
    const [needsMigration, setNeedsMigration] = useState(false);
    const [showZeroBalanceMessage, setShowZeroBalanceMessage] = useState(false);
    const [isChecking, setIsChecking] = useState(true);
    const [isMigrationComplete, setIsMigrationComplete] = useState<boolean | null>(null);

    useEffect(() => {
        async function checkMigrationStatus() {
            if (!authenticated || !user) {
                setNeedsMigration(false);
                setShowZeroBalanceMessage(false);
                setIsChecking(false);
                return;
            }

            const smartWallet = user.linkedAccounts.find(
                (account) => account.type === "smart_wallet"
            );

            if (!smartWallet) {
                setNeedsMigration(false);
                setShowZeroBalanceMessage(false);
                setIsChecking(false);
                return;
            }

            // Don't wait for balance loading - handle API call independently

            try {
                const accessToken = await getAccessToken();
                if (!accessToken) {
                    console.warn("No access token available for wallet migration status check");
                    // Fall back to default behavior when auth is not available
                    const hasBalance = smartWalletBalance > 0;
                    setNeedsMigration(hasBalance);
                    setShowZeroBalanceMessage(!hasBalance);
                    setIsChecking(false);
                    return;
                }

                const response = await fetch(`/api/v1/wallets/migration-status?userId=${user.id}`, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    const alreadyMigrated = data.migrationCompleted ?? false;
                    setIsMigrationComplete(alreadyMigrated);
                    setIsChecking(false);
                    return;
                } else {
                    console.error("Migration status API error:", response.status, response.statusText);
                    // Set migration as incomplete on API error
                    setIsMigrationComplete(false);
                }
            } catch (error) {
                console.error("Error checking wallet migration status:", error);
                // Set migration as incomplete on error
                setIsMigrationComplete(false);
            }

            setIsChecking(false);
        }

        checkMigrationStatus();
    }, [authenticated, user?.id, getAccessToken]); // Only re-run when user changes

    // Separate effect to handle balance-based migration status display
    useEffect(() => {
        if (isMigrationComplete === null || isBalanceLoading) {
            // Still loading migration status or balances
            return;
        }

        if (isMigrationComplete) {
            // Migration is complete - hide all migration UI
            setNeedsMigration(false);
            setShowZeroBalanceMessage(false);
        } else {
            // Migration not complete - show UI based on balance
            const smartWalletBalance = allBalances.smartWallet?.total ?? 0;
            const hasBalance = smartWalletBalance > 0;
            setNeedsMigration(hasBalance);
            setShowZeroBalanceMessage(!hasBalance);
        }
    }, [isMigrationComplete, allBalances.smartWallet?.total, isBalanceLoading]);

    return { needsMigration, isChecking, showZeroBalanceMessage };
}

/** Biconomy Nexus 1.2.0 implementation address for EIP-7702 delegation. */
export const BICONOMY_NEXUS_V120 = config.biconomyNexusV120;

// Warn about missing configuration but don't crash the app
if (!BICONOMY_NEXUS_V120 || BICONOMY_NEXUS_V120 === "") {
    console.warn("BICONOMY_NEXUS_V120 not configured - EIP-7702 migration features will be disabled. Please set NEXT_PUBLIC_BICONOMY_NEXUS_V120 in your environment.");
}

/**
 * Hook to sign EIP-7702 authorizations for Biconomy Nexus (MEE).
 * Sign with the execution chainId so MEE has authorization for that chain (e.g. 8453 for Base).
 *
 * @see https://docs.biconomy.io/new/integration-guides/wallets-and-signers/privy
 *
 * @example
 * const { signBiconomyAuthorization } = useBiconomy7702Auth();
 * const authorization = await signBiconomyAuthorization(chain.id);
 */
export function useBiconomy7702Auth() {
    const { signAuthorization } = useSign7702Authorization();
    const { wallets } = useWallets();
    const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");

    const signBiconomyAuthorization = useCallback(
        async (chainId: number): Promise<SignedAuthorization> => {
            if (!embeddedWallet?.address) {
                throw new Error("Embedded wallet not ready for EIP-7702 signing");
            }
            if (!BICONOMY_NEXUS_V120 || BICONOMY_NEXUS_V120 === "") {
                throw new Error("Biconomy Nexus V1.2.0 address is not configured. Please set NEXT_PUBLIC_BICONOMY_NEXUS_V120 in your environment.");
            }
            const signed = await signAuthorization(
                {
                    contractAddress: BICONOMY_NEXUS_V120 as `0x${string}`,
                    chainId,
                },
                { address: embeddedWallet.address as Address }
            );
            return signed as SignedAuthorization;
        },
        [signAuthorization, embeddedWallet?.address]
    );

    return { signBiconomyAuthorization };
}