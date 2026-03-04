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
import { useMigrationStatus, triggerMigrationStatusRefetch } from "../context/MigrationStatusContext";
import config from "../lib/config";

// Treat tiny residual balances as zero for migration UX decisions.
const MIGRATION_DUST_USD_THRESHOLD = 0.001;

function hasMeaningfulBalance(value: number | null | undefined): boolean {
    return Number(value ?? 0) >= MIGRATION_DUST_USD_THRESHOLD;
}

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

// Re-export from centralized context so existing imports still work
export { useMigrationStatus, triggerMigrationStatusRefetch } from "../context/MigrationStatusContext";

// ################################################
// ########## SHOULD USE EOA (NAV + ACTIONS) ######
// ################################################

/**
 * True when the app should use the embedded wallet (EOA) for nav, balance, createOrder, transfer.
 * True if: migrated in DB, OR smart wallet has 0 balance across all networks (treat as EOA without DB migration).
 * Uses cross-chain SCW total so the displayed address does not change when switching networks.
 */
export function useShouldUseEOA(): boolean {
    const { user } = usePrivy();
    const { isMigrationComplete, isLoading: isMigrationLoading } = useMigrationStatus();
    const { crossChainTotal, isLoading: isBalanceLoading } = useBalance();
    const lastValueRef = useRef<boolean | null>(null);

    const hasSmartWallet = !!user?.linkedAccounts?.find((a) => a.type === "smart_wallet");
    const smartWalletCrossChainTotal = hasSmartWallet && !isMigrationComplete ? crossChainTotal : 0;

    if (user == null) {
        return lastValueRef.current ?? true;
    }

    if (!hasSmartWallet) {
        lastValueRef.current = true;
        return true;
    }
    if (isMigrationComplete) {
        lastValueRef.current = true;
        return true;
    }
    // While migration status or balances are loading, hold the last value.
    // Default to true (EOA) so we never briefly flash the old SCW address/balance.
    if (isMigrationLoading || isBalanceLoading) return lastValueRef.current ?? true;
    const value = !hasMeaningfulBalance(smartWalletCrossChainTotal);
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
    isRemainingFundsMigration: boolean;
    refetchMigrationStatus: () => void;
}

/**
 * Hook to check if wallet migration is needed
 * - needsMigration: show full "Start migration" banner (has funds in SCW, not migrated)
 * - showZeroBalanceMessage: show short text only (0 balance SCW; nav/actions use EOA)
 *
 * Uses the shared MigrationStatusProvider instead of its own API call.
 */
export function useWalletMigrationStatus(): WalletMigrationStatus {
    const { user, authenticated } = usePrivy();
    const { isMigrationComplete, isLoading: isMigrationLoading, refetch } = useMigrationStatus();
    const { crossChainTotal, isLoading: isBalanceLoading, smartWalletRemainingTotal } = useBalance();
    const [needsMigration, setNeedsMigration] = useState(false);
    const [showZeroBalanceMessage, setShowZeroBalanceMessage] = useState(false);

    const hasSmartWallet = !!user?.linkedAccounts?.some(
        (account) => account.type === "smart_wallet"
    );

    const isChecking = isMigrationLoading || isBalanceLoading;

    useEffect(() => {
        if (!authenticated || !user || !hasSmartWallet) {
            setNeedsMigration(false);
            setShowZeroBalanceMessage(false);
            return;
        }

        if (isMigrationLoading || isBalanceLoading) return;

        if (isMigrationComplete) {
            setNeedsMigration(hasMeaningfulBalance(smartWalletRemainingTotal));
            setShowZeroBalanceMessage(false);
        } else {
            const hasBalance = hasMeaningfulBalance(crossChainTotal);
            setNeedsMigration(hasBalance);
            setShowZeroBalanceMessage(!hasBalance);
        }
    }, [authenticated, user, hasSmartWallet, isMigrationComplete, isMigrationLoading, crossChainTotal, isBalanceLoading, smartWalletRemainingTotal]);

    const isRemainingFundsMigration =
        isMigrationComplete === true && hasMeaningfulBalance(smartWalletRemainingTotal);

    return { needsMigration, isChecking, showZeroBalanceMessage, isRemainingFundsMigration, refetchMigrationStatus: refetch };
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