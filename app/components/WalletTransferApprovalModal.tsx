"use client";
import React, { useState, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Dialog, DialogPanel } from "@headlessui/react";
import { Cancel01Icon, Wallet01Icon, InformationCircleIcon } from "hugeicons-react";
import Image from "next/image";
import { useBalance } from "../context/BalanceContext";
import { useTokens } from "../context";
import { useNetwork } from "../context/NetworksContext";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { formatCurrency, shortenAddress, getNetworkImageUrl } from "../utils";
import { useActualTheme } from "../hooks/useActualTheme";
import { useCNGNRate } from "../hooks/useCNGNRate";
import WalletMigrationSuccessModal from "./WalletMigrationSuccessModal";
import { type Address, encodeFunctionData, parseAbi, createPublicClient, http } from "viem";
import { base, baseSepolia, polygon, arbitrum, bsc, mainnet, lisk } from "viem/chains";
import { toast } from "sonner";

// Map network names to viem chains
const CHAIN_MAP: Record<string, any> = {
    "Base": base,
    "Base Sepolia": baseSepolia,
    "Polygon": polygon,
    "Arbitrum One": arbitrum,
    "BNB Smart Chain": bsc,
    "Ethereum": mainnet,
    "Lisk": lisk,
};

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

    const { allBalances, isLoading } = useBalance();
    const { allTokens } = useTokens();
    const { selectedNetwork } = useNetwork();
    const { user, getAccessToken } = usePrivy();
    const { wallets } = useWallets();
    const isDark = useActualTheme();
    const { rate } = useCNGNRate({
        network: selectedNetwork.chain.name,
        dependencies: [selectedNetwork],
    });

    // Get wallet addresses
    const smartWallet = user?.linkedAccounts.find(a => a.type === "smart_wallet");
    const embeddedWallet = wallets.find(w => w.walletClientType === "privy");

    const oldAddress = smartWallet?.address; // SCW
    const newAddress = embeddedWallet?.address; // EOA
    // -------------------- Group tokens by chain --------------------
    const tokensByChain = useMemo(() => {
        const grouped: Record<string, any[]> = {};

        const smartWalletData = allBalances.smartWallet;
        if (!smartWalletData) return grouped;

        const balances = smartWalletData.balances || {};
        const networkName = selectedNetwork.chain.name;
        const fetchedTokens = allTokens[networkName] || [];

        Object.entries(balances).forEach(([symbol, balance]) => {
            const balanceNum = balance as number;
            if (balanceNum <= 0) return;

            const tokenMeta = fetchedTokens.find(t =>
                t.symbol.toUpperCase() === symbol.toUpperCase()
            );

            if (tokenMeta?.address) {
                let usdValue = balanceNum;
                if (symbol.toUpperCase() === "CNGN" && rate) {
                    usdValue = balanceNum / rate;
                }

                const token = {
                    id: `${networkName}-${symbol}`,
                    chain: networkName,
                    name: tokenMeta.name || symbol,
                    symbol,
                    amount: balanceNum,
                    displayAmount: balanceNum.toFixed(2),
                    value: `${usdValue.toFixed(2)}`,
                    icon: `/logos/${symbol.toLowerCase()}-logo.svg`,
                    address: tokenMeta.address,
                    decimals: tokenMeta.decimals || 18,
                };

                if (!grouped[networkName]) {
                    grouped[networkName] = [];
                }

                grouped[networkName].push(token);
            } else {
                console.warn(`⚠️ No metadata found for ${symbol} on ${networkName}`);
            }
        });

        return grouped;
    }, [allBalances, allTokens, rate, selectedNetwork]);

    // Flatten for display
    const tokens = useMemo(() => {
        return Object.values(tokensByChain).flat();
    }, [tokensByChain]);

    const totalBalance = useMemo(() => {
        const sum = tokens.reduce((acc, t) => acc + t.amount, 0);
        return formatCurrency(sum, "USD", "en-US");
    }, [tokens]);

    const handleCloseSuccessModal = () => setShowSuccessModal(false);

    // -------------------- Migration Handler --------------------
    const handleApproveTransfer = async () => {
        if (!user || !oldAddress || !newAddress || !embeddedWallet) {
            setError("Wallet not ready");
            return;
        }

        if (tokens.length === 0) {
            setError("No tokens to migrate");
            return;
        }

        setIsProcessing(true);
        setError(null);
        setProgress("Initializing migration...");

        try {
            const accessToken = await getAccessToken();
            if (!accessToken) throw new Error("Failed to get access token");

            const allTxHashes: string[] = [];
            const chains = Object.keys(tokensByChain);

            // ✅ Get the embedded wallet provider (we'll use this to send transactions)
            const eoaProvider = await embeddedWallet.getEthereumProvider();

            console.log('🔍 Debug - All wallets:', wallets.map(w => ({
                address: w.address,
                type: w.walletClientType,
                chainId: w.chainId,
            })));

            console.log('🔍 Debug - User linked accounts:', user?.linkedAccounts.map(a => ({
                type: a.type,
                address: (a as any).address,
            })));

            // ✅ Find the smart wallet object in wallets array
            // Try different ways to find the SCW
            let scwWallet = wallets.find(w =>
                w.address.toLowerCase() === oldAddress.toLowerCase()
            );

            // If not found, the SCW might be controlled through the embedded wallet
            // In Privy, embedded wallets can control SCWs
            if (!scwWallet) {
                console.log('⚠️ SCW not found in wallets array, will use embedded wallet to control it');
                scwWallet = embeddedWallet; // Use EOA to control SCW
            }

            const scwProvider = await scwWallet.getEthereumProvider();

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
                    // ✅ Switch to the correct chain
                    try {
                        await scwProvider.request({
                            method: "wallet_switchEthereumChain",
                            params: [{ chainId: `0x${chain.id.toString(16)}` }],
                        });
                    } catch (switchError: any) {
                        // Chain might not be added, try to add it
                        if (switchError.code === 4902) {
                            await scwProvider.request({
                                method: "wallet_addEthereumChain",
                                params: [{
                                    chainId: `0x${chain.id.toString(16)}`,
                                    chainName: chain.name,
                                    rpcUrls: [chain.rpcUrls.default.http[0]],
                                }],
                            });
                        } else {
                            throw switchError;
                        }
                    }

                    // ✅ Create public client for waiting for receipts
                    const publicClient = createPublicClient({
                        chain,
                        transport: http(),
                    });

                    // ✅ Transfer each token from SCW to EOA
                    for (const token of chainTokens) {
                        const amountInWei = BigInt(
                            Math.floor(token.amount * Math.pow(10, token.decimals))
                        );

                        setProgress(`Transferring ${token.symbol} on ${chainName}...`);

                        // ✅ Encode the transfer function call
                        const transferData = encodeFunctionData({
                            abi: parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]),
                            functionName: "transfer",
                            args: [newAddress as Address, amountInWei],
                        });

                        // ✅ Send transaction from SCW to transfer tokens
                        const txHash = await scwProvider.request({
                            method: "eth_sendTransaction",
                            params: [{
                                from: oldAddress, // SCW address
                                to: token.address, // Token contract
                                data: transferData, // transfer(newAddress, amount)
                            }],
                        }) as string;

                        allTxHashes.push(txHash);

                        // ✅ Wait for transaction confirmation
                        setProgress(`Confirming ${token.symbol} transfer...`);

                        const receipt = await publicClient.waitForTransactionReceipt({
                            hash: txHash as `0x${string}`,
                            confirmations: 1,
                        });

                        if (receipt.status === 'success') {
                            toast.success(`${token.symbol} migrated!`, {
                                description: `${token.amount} ${token.symbol} transferred to your EOA`
                            });
                        } else {
                            throw new Error(`Transaction failed for ${token.symbol}`);
                        }
                    }

                    toast.success(`${chainName} migration complete!`);

                } catch (chainError) {
                    const errorMsg = chainError instanceof Error ? chainError.message : 'Unknown error';
                    toast.error(`Failed to migrate ${chainName}`, {
                        description: errorMsg
                    });
                }
            }

            if (allTxHashes.length === 0) {
                throw new Error("No successful migrations");
            }

            // ✅ Update Backend - Deprecate old wallet
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
                    txHash: allTxHashes[0], // Primary transaction hash
                    userId: user.id
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.warn('⚠️ Database update failed:', errorText);
                throw new Error("Failed to update backend");
            }

            toast.success("🎉 Migration Complete!", {
                description: `${allTxHashes.length} token(s) successfully migrated to your EOA`,
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
                    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
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
                                                {isLoading ? (
                                                    <div className="text-sm text-text-secondary dark:text-white/50">Loading balances...</div>
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
                                                                    <Image
                                                                        src={getNetworkImageUrl(selectedNetwork, isDark)}
                                                                        alt={selectedNetwork.chain.name}
                                                                        width={16}
                                                                        height={16}
                                                                        className="absolute -bottom-1 -right-1 size-6 rounded-full"
                                                                    />
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
                                                disabled={isProcessing || isLoading || tokens.length === 0}
                                                className="w-full rounded-xl bg-lavender-500 px-6 py-3.5 text-base font-semibold text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                                            >
                                                {isProcessing ? progress || "Processing migration..." : "Approve transfer"}
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