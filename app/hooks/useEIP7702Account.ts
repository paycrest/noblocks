"use client";
import { useWallets, useSign7702Authorization } from "@privy-io/react-auth";
import { useCallback, useEffect, useState } from "react";
import {
    type Address,
    type Chain,
    type PublicClient,
    SignedAuthorization,
    createPublicClient,
    http,
} from "viem";
import config, { getDelegationContractAddress } from "../lib/config";

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
 *
 * Always true: legacy smart wallets were discontinued with the Biconomy removal (#557), along
 * with the migration flow that moved funds off them. Selecting an SCW that still holds a balance
 * left those users unable to sell (the SCW has no KYC profile, and its orders fail on-chain) or
 * transfer (which asked for a migration that no longer exists). Residual SCW balances are
 * recovered outside the app.
 *
 * Kept as a hook so the SCW branches at call sites stay compiled until they are removed.
 */
export function useShouldUseEOA(): boolean {
    return true;
}

/**
 * Hook to sign EIP-7702 authorizations for the delegation contract.
 * Sign with the execution chainId so the account delegates to the contract on that chain.
 *
 * @example
 * const { signDelegationAuthorization } = useDelegationContractAuth();
 * const authorization = await signDelegationAuthorization(chain.id);
 */
export function useDelegationContractAuth() {
    const { signAuthorization } = useSign7702Authorization();
    const { wallets } = useWallets();
    const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");

    const signDelegationAuthorization = useCallback(
        async (chainId: number): Promise<SignedAuthorization> => {
            if (!embeddedWallet?.address) {
                throw new Error("Embedded wallet not ready for EIP-7702 signing");
            }
            const delegationAddress = getDelegationContractAddress(chainId);
            if (!delegationAddress || delegationAddress === "") {
                throw new Error(`Delegation contract not configured for chain ${chainId}. Add it to DELEGATION_CONTRACT_BY_CHAIN in app/lib/config.ts.`);
            }
            const signed = await signAuthorization(
                {
                    contractAddress: delegationAddress as `0x${string}`,
                    chainId,
                },
                { address: embeddedWallet.address as Address }
            );
            return signed as SignedAuthorization;
        },
        [signAuthorization, embeddedWallet?.address]
    );

    return { signDelegationAuthorization };
}