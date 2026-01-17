"use client";
import React, { useState, useMemo, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Dialog, DialogPanel } from "@headlessui/react";
import { Cancel01Icon, Wallet01Icon, InformationCircleIcon } from "hugeicons-react";
import Image from "next/image";
import { useBalance } from "../context/BalanceContext";
import { useTokens } from "../context";
import { useNetwork } from "../context/NetworksContext";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { formatCurrency, shortenAddress, getNetworkImageUrl, fetchWalletBalance } from "../utils";
import { useActualTheme } from "../hooks/useActualTheme";
import { getCNGNRateForNetwork } from "../hooks/useCNGNRate";
import WalletMigrationSuccessModal from "./WalletMigrationSuccessModal";
import { type Address, encodeFunctionData, parseAbi, createPublicClient, http, parseUnits } from "viem";
import { toast } from "sonner";
import { networks } from "../mocks";

// Map network names to viem chains
const CHAIN_MAP = Object.fromEntries(
    networks.map(n => [n.chain.name, n.chain])
);

interface WalletTransferApprovalModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const WalletTransferApprovalModal: React.FC<WalletTransferApprovalModalProps> = ({
    isOpen,
    onClose,
}) => {
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<string>("");
    const [allChainBalances, setAllChainBalances] = useState<Record<string, Record<string, number>>>({});
    const [isFetchingBalances, setIsFetchingBalances] = useState(false);
    const [chainRates, setChainRates] = useState<Record<string, number | null>>({});

    const { allBalances, isLoading } = useBalance();
    const { allTokens } = useTokens();
    const { selectedNetwork } = useNetwork();
    const { user, getAccessToken } = usePrivy();
    const { wallets } = useWallets();
    const { client: smartWalletClient } = useSmartWallets();
    const isDark = useActualTheme();

    // Get wallet addresses
    const smartWallet = user?.linkedAccounts.find(a => a.type === "smart_wallet");
    const embeddedWallet = wallets.find(w => w.walletClientType === "privy");

    const oldAddress = smartWallet?.address; // SCW
    const newAddress = embeddedWallet?.address; // EOA

    // -------------------- Fetch balances from all networks --------------------
    useEffect(() => {
        if (!isOpen || !oldAddress) return;

        const fetchAllChainBalances = async () => {
            setIsFetchingBalances(true);
            const balancesByChain: Record<string, Record<string, number>> = {};

            // Fetch balances for each supported network
            for (const network of networks) {
                try {
                    const publicClient = createPublicClient({
                        chain: network.chain,
                        transport: http(),
                    });

                    const result = await fetchWalletBalance(
                        publicClient,
                        oldAddress
                    );

                    // Only include chains with non-zero balances
                    const hasBalance = Object.values(result.balances).some(b => b > 0);
                    if (hasBalance) {
                        balancesByChain[network.chain.name] = result.balances;
                    }
                } catch (error) {
                    console.error(`Error fetching balances for ${network.chain.name}:`, error);
                }
            }

            setAllChainBalances(balancesByChain);
            setIsFetchingBalances(false);
        };

        fetchAllChainBalances();
    }, [isOpen, oldAddress]);

    // -------------------- Fetch CNGN rates for each chain --------------------
    useEffect(() => {
        if (!isOpen || Object.keys(allChainBalances).length === 0) return;

        const fetchChainRates = async () => {
            const rates: Record<string, number | null> = {};

            // Fetch rates for chains that have CNGN tokens
            for (const [chainName, balances] of Object.entries(allChainBalances)) {
                if (balances.CNGN || balances.cNGN) {
                    try {
                        const rate = await getCNGNRateForNetwork(chainName);
                        rates[chainName] = rate;
                    } catch (error) {
                        console.error(`Error fetching CNGN rate for ${chainName}:`, error);
                        rates[chainName] = null;
                    }
                }
            }

            setChainRates(rates);
        };

        fetchChainRates();
    }, [isOpen, allChainBalances]);

    // -------------------- Group tokens by chain from all networks --------------------
    const tokensByChain = useMemo(() => {
        const grouped: Record<string, any[]> = {};

        // Process balances from all chains
        for (const [chainName, balances] of Object.entries(allChainBalances)) {
            const fetchedTokens = allTokens[chainName] || [];

            for (const [symbol, balance] of Object.entries(balances)) {
                const balanceNum = balance as number;
                if (balanceNum <= 0) continue;

                const tokenMeta = fetchedTokens.find(t =>
                    t.symbol.toUpperCase() === symbol.toUpperCase()
                );

                if (tokenMeta?.address) {
                    // Get CNGN rate for this specific chain if needed
                    const isCNGN = symbol.toUpperCase() === "CNGN";
                    const chainRate = isCNGN ? chainRates[chainName] : undefined;
                    let usdValue = balanceNum;
                    if (isCNGN && chainRate) {
                        usdValue = balanceNum / chainRate;
                    }

                    const token = {
                        id: `${chainName}-${symbol}`,
                        chain: chainName,
                        name: tokenMeta.name || symbol,
                        symbol,
                        amount: balanceNum,
                        displayAmount: balanceNum.toFixed(2),
                        value: `${usdValue.toFixed(2)}`,
                        icon: `/logos/${symbol.toLowerCase()}-logo.svg`,
                        address: tokenMeta.address,
                        decimals: tokenMeta.decimals || 18,
                    };

                    if (!grouped[chainName]) {
                        grouped[chainName] = [];
                    }

                    grouped[chainName].push(token);
                } else {
                    console.warn(`⚠️ No metadata found for ${symbol} on ${chainName}`);
                }
            }
        }

        return grouped;
    }, [allChainBalances, allTokens, chainRates]);

    // Flatten for display
    const tokens = useMemo(() => {
        return Object.values(tokensByChain).flat();
    }, [tokensByChain]);

    const totalBalance = useMemo(() => {
        const sum = tokens.reduce((acc, t) => acc + parseFloat(t.value || "0"), 0);
        return formatCurrency(sum, "USD", "en-US");
    }, [tokens]);

    // Helper to get network config for a chain name
    const getNetworkConfig = (chainName: string) => {
        return networks.find(n => n.chain.name === chainName);
    };

    const handleCloseSuccessModal = () => setShowSuccessModal(false);

    // Handle approve transfer
    const handleApproveTransfer = async () => {
        if (!user || !oldAddress || !newAddress || !embeddedWallet) {
            setError("Wallet not ready");
            return;
        }

        // ✅ Allow migration even with zero balance - need to deprecate old SCW
        const hasTokens = tokens.length > 0;

        if (!hasTokens) {
            // No tokens to transfer, but still need to deprecate old wallet
            setProgress("No tokens to migrate, but deprecating old wallet...");
        }

        setIsProcessing(true);
        setError(null);
        setProgress(hasTokens ? "Initializing migration..." : "Deprecating old wallet...");

        try {
            const accessToken = await getAccessToken();
            if (!accessToken) throw new Error("Failed to get access token");

            const allTxHashes: string[] = [];
            const chains = Object.keys(tokensByChain);
            let totalTokensMigrated = 0;

            // ✅ If tokens exist, process transfers
            if (hasTokens) {
                // ✅ Check if smart wallet client is available
                if (!smartWalletClient) {
                    throw new Error("Smart wallet client not available. Please ensure you have a smart wallet linked.");
                }

                for (let i = 0; i < chains.length; i++) {
                    const chainName = chains[i];
                    const chainTokens = tokensByChain[chainName];
                    const chain = CHAIN_MAP[chainName];

                    if (!chain) {
                        console.warn(`Chain ${chainName} not supported, skipping...`);
                        continue;
                    }

                    setProgress(`Processing ${chainName} (${i + 1}/${chains.length})...`);

                    try {
                        // ✅ Switch to the correct chain using smart wallet client
                        await smartWalletClient.switchChain({
                            id: chain.id,
                        });

                        // ✅ Create public client for waiting for receipts
                        const publicClient = createPublicClient({
                            chain,
                            transport: http(),
                        });

                        // ✅ Batch all token transfers into a single transaction for gasless execution
                        // This uses Privy's smart wallet batch capability with Biconomy paymaster
                        const calls = chainTokens.map((token) => {
                            // Use parseUnits for precise decimal handling (avoids floating-point precision loss)
                            const amountInWei = parseUnits(
                                token.amount.toString(),
                                token.decimals
                            );

                            // ✅ Encode the transfer function call
                            const transferData = encodeFunctionData({
                                abi: parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]),
                                functionName: "transfer",
                                args: [newAddress as Address, amountInWei],
                            });

                            return {
                                to: token.address as `0x${string}`,
                                data: transferData as `0x${string}`,
                                value: BigInt(0),
                            };
                        });

                        if (calls.length === 0) {
                            console.warn(`No tokens to migrate on ${chainName}`);
                            continue;
                        }

                        setProgress(`Transferring ${calls.length} token(s) on ${chainName} (gasless)...`);

                        // ✅ Send batched transaction from SCW
                        const txHash = (await smartWalletClient.sendTransaction({
                            calls,
                        })) as `0x${string}`;

                        allTxHashes.push(txHash);

                        // ✅ Wait for transaction confirmation
                        setProgress(`Confirming ${chainName} migration...`);

                        const receipt = await publicClient.waitForTransactionReceipt({
                            hash: txHash as `0x${string}`,
                            confirmations: 1,
                        });

                        if (receipt.status === 'success') {
                            totalTokensMigrated += calls.length;
                            toast.success(`${chainName} migration complete!`, {
                                description: `${calls.length} token(s) transferred to your EOA (gasless)`
                            });
                        } else {
                            throw new Error(`Transaction failed for ${chainName}`);
                        }

                    } catch (chainError) {
                        const errorMsg = chainError instanceof Error ? chainError.message : 'Unknown error';
                        toast.error(`Failed to migrate ${chainName}`, {
                            description: errorMsg
                        });
                    }
                }
            } // End of hasTokens block

            // ✅ Update Backend - Deprecate old wallet
            // This happens regardless of whether tokens were transferred
            // (even if zero balance, we need to deprecate the old SCW)
            setProgress("Finalizing migration...");

            const response = await fetch("/api/v1/wallets/deprecate", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "x-wallet-address": newAddress,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    oldAddress,
                    newAddress,
                    txHash: allTxHashes.length > 0 ? allTxHashes[0] : null, // null if no transactions
                    userId: user.id
                }),
            });

            if (!response.ok) {
                throw new Error("Failed to update backend");
            }

            toast.success("🎉 Migration Complete!", {
                description: hasTokens
                    ? `${totalTokensMigrated} token(s) successfully migrated to your EOA`
                    : "Old wallet deprecated successfully",
                duration: 5000,
            });

            onClose();
            setTimeout(() => setShowSuccessModal(true), 300);

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Migration failed";
            setError(errorMessage);
            toast.error("Migration failed", {
                description: errorMessage,
            });
        } finally {
            setIsProcessing(false);
            setProgress("");
        }
    };

    // -------------------- UI --------------------
    const displayOldAddress = shortenAddress(oldAddress ?? "", 6);
    const displayNewAddress = shortenAddress(newAddress ?? "", 6);

    return (
        <>
            <AnimatePresence>
                {isOpen && (
                    <Dialog
                        open={isOpen}
                        onClose={isProcessing ? () => { } : () => onClose()}
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
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
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
                                            style={{ background: "linear-gradient(90deg, #746F0D 0%, #164D81 50%, #361E64 100%)" }}
                                        >
                                            <button
                                                onClick={onClose}
                                                className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"
                                                disabled={isProcessing}
                                            >
                                                <Cancel01Icon className="h-5 w-5" strokeWidth={2} />
                                            </button>
                                        </div>

                                        <div className="relative -mt-6 w-full overflow-y-auto rounded-t-[24px] bg-white p-5 pt-6 text-text-body sm:max-h-[90vh] dark:bg-[#2C2C2C] dark:text-white">
                                            <h2 className="mb-6 text-xl font-semibold">Wallet Migration</h2>

                                            {/* Old Wallet Balance Card */}
                                            <div className="mb-4 space-y-3 rounded-[20px] border border-border-light p-4 dark:border-white/10">
                                                <div className="flex items-center gap-2">
                                                    <Wallet01Icon className="h-5 w-5 text-text-secondary dark:text-white/60" strokeWidth={2} />
                                                    <span className="text-sm font-medium">Smart Contract Wallet</span>
                                                </div>
                                                <div className="text-sm text-text-secondary dark:text-white/50">
                                                    {displayOldAddress}
                                                </div>
                                                <div className="text-sm text-text-secondary dark:text-white/50">
                                                    Total balance
                                                </div>
                                                <div className="text-3xl font-semibold">{isLoading ? "..." : totalBalance}</div>
                                            </div>

                                            {/* Progress indicator */}
                                            {progress && (
                                                <div className="mb-4 rounded-xl bg-blue-50 p-4 text-sm text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent dark:border-blue-400 dark:border-t-transparent" />
                                                        {progress}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Token List */}
                                            <div className="mb-4 space-y-3">
                                                {isFetchingBalances || isLoading ? (
                                                    <div className="text-sm text-text-secondary dark:text-white/50">Loading balances from all networks...</div>
                                                ) : tokens.length === 0 ? (
                                                    <div className="text-sm text-text-secondary dark:text-white/50">No tokens found</div>
                                                ) : (
                                                    tokens.map((token) => (
                                                        <div key={token.id} className="flex items-center justify-between rounded-2xl py-4">
                                                            <div className="flex items-center gap-3">
                                                                <div className="relative">
                                                                    <Image
                                                                        src={token.icon}
                                                                        alt={token.name}
                                                                        width={32}
                                                                        height={32}
                                                                        className="size-10 rounded-full"
                                                                        onError={(e) => {
                                                                            (e.target as HTMLImageElement).style.display = 'none';
                                                                        }}
                                                                    />
                                                                    {(() => {
                                                                        const networkConfig = getNetworkConfig(token.chain);
                                                                        if (!networkConfig) return null;
                                                                        const imageUrl = typeof networkConfig.imageUrl === 'string'
                                                                            ? networkConfig.imageUrl
                                                                            : (isDark ? networkConfig.imageUrl.dark : networkConfig.imageUrl.light);
                                                                        return (
                                                                            <Image
                                                                                src={imageUrl}
                                                                                alt={token.chain}
                                                                                width={16}
                                                                                height={16}
                                                                                className="absolute -bottom-1 -right-1 size-6 rounded-full"
                                                                            />
                                                                        );
                                                                    })()}
                                                                </div>
                                                                <div className="flex flex-col">
                                                                    <span className="text-sm font-medium">{token.name}</span>
                                                                    <span className="text-xs text-text-secondary dark:text-white/50">
                                                                        {token.displayAmount} {token.symbol}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-col items-end">
                                                                <span className="text-sm font-medium">${token.value}</span>
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>

                                            {/* Info Banner */}
                                            <div className="mb-6 flex items-start gap-2.5 rounded-2xl border border-border-light bg-accent-gray p-4 dark:border-white/10 dark:bg-[#3c3a38]">
                                                <InformationCircleIcon
                                                    className="mt-0.5 h-5 w-5 flex-shrink-0 text-text-secondary dark:text-white/60"
                                                    strokeWidth={2}
                                                />
                                                <p className="text-sm leading-relaxed">
                                                    Your funds will be transferred to your new EOA address{" "}
                                                    <span className="font-semibold">{displayNewAddress}</span>.
                                                    This EOA can be upgraded with EIP-7702 for enhanced features.
                                                </p>
                                            </div>

                                            {/* Error */}
                                            {error && (
                                                <div className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                                                    {error}
                                                </div>
                                            )}

                                            {/* Approve Transfer Button */}
                                            <button
                                                onClick={handleApproveTransfer}
                                                disabled={isProcessing || isLoading || isFetchingBalances || tokens.length === 0}
                                                className="w-full rounded-xl bg-lavender-500 px-6 py-3.5 text-base font-semibold text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                                            >
                                                {isProcessing ? progress || "Processing migration..." : isFetchingBalances ? "Loading balances..." : "Approve transfer"}
                                            </button>
                                        </div>
                                    </motion.div>
                                </DialogPanel>
                            </motion.div>
                        </div>
                    </Dialog>
                )}
            </AnimatePresence>

            <WalletMigrationSuccessModal isOpen={showSuccessModal} onClose={handleCloseSuccessModal} />
        </>
    );
};

export default WalletTransferApprovalModal;