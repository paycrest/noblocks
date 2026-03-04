"use client";
import React, { useState, useMemo, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Dialog, DialogPanel } from "@headlessui/react";
import { Cancel01Icon, Wallet01Icon, InformationCircleIcon, InformationSquareIcon } from "hugeicons-react";
import Image from "next/image";
import { useBalance } from "../context/BalanceContext";
import { useTokens } from "../context";
import { useNetwork } from "../context/NetworksContext";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { formatCurrency, shortenAddress, getNetworkImageUrl, fetchWalletBalance, getRpcUrl } from "../utils";
import { useActualTheme } from "../hooks/useActualTheme";
import { getCNGNRateForNetwork } from "../hooks/useCNGNRate";
import WalletMigrationSuccessModal from "./WalletMigrationSuccessModal";
import { type Address, type Chain, createPublicClient, http, fallback, erc20Abi, encodeAbiParameters } from "viem";
import { bsc } from "viem/chains";
import { toast } from "sonner";
import { networks } from "../mocks";
import config from "../lib/config";
import {
  createMeeClient,
  toMultichainNexusAccount,
  getMEEVersion,
  MEEVersion,
} from "@biconomy/abstractjs";

function getTransportForChain(chain: Chain) {
    if (chain.id === bsc.id) {
        return fallback([
            http(getRpcUrl(chain.name)),
            http("https://bsc-dataseed.bnbchain.org/"),
        ]);
    }
    return http(getRpcUrl(chain.name));
}

// Map network names to viem chains
const CHAIN_MAP = Object.fromEntries(
    networks.map(n => [n.chain.name, n.chain])
);

// Biconomy v2 ECDSA module address (same across chains). Signature must be ABI-encoded as (bytes moduleSig, address moduleAddress) per blog.
const BICONOMY_V2_ECDSA_MODULE = "0x0000001c5b32F37F5beA87BDD5374eB2aC54eA8e" as const;
// Ignore tiny balances in UI and migration. 1e-6 token + $0.001 min value.
const DUST_USD_THRESHOLD = 0.001;
const DUST_TOKEN_DECIMALS = 6;

function getDustRawThreshold(decimals: number): bigint {
    if (decimals <= DUST_TOKEN_DECIMALS) return BigInt(1);
    return BigInt(10) ** BigInt(decimals - DUST_TOKEN_DECIMALS);
}

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
    const [allChainRawBalances, setAllChainRawBalances] = useState<Record<string, Record<string, bigint>>>({});
    const [isFetchingBalances, setIsFetchingBalances] = useState(false);
    const [chainRates, setChainRates] = useState<Record<string, number | null>>({});

    const { allBalances, isLoading } = useBalance();
    const { allTokens } = useTokens();
    const { selectedNetwork } = useNetwork();
    const { user, getAccessToken } = usePrivy();
    const { wallets } = useWallets();
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
            const rawByChain: Record<string, Record<string, bigint>> = {};

            // Fetch balances for each supported network
            for (const network of networks) {
                try {
                    const publicClient = createPublicClient({
                        chain: network.chain,
                        transport: getTransportForChain(network.chain),
                    });

                    const result = await fetchWalletBalance(
                        publicClient,
                        oldAddress
                    );

                    // Only include chains with non-zero balances
                    const hasBalance = Object.values(result.balances).some(b => b > 0);
                    if (hasBalance) {
                        balancesByChain[network.chain.name] = result.balances;
                        rawByChain[network.chain.name] = result.balancesInWei;
                    }
                } catch (error) {
                    console.error(`Error fetching balances for ${network.chain.name}:`, error);
                }
            }

            setAllChainBalances(balancesByChain);
            setAllChainRawBalances(rawByChain);
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
                    const rawAmount = allChainRawBalances[chainName]?.[symbol] ?? BigInt(0);
                    const decimals = tokenMeta.decimals || 18;
                    const dustRawThreshold = getDustRawThreshold(decimals);
                    // Hide tiny balances (dust) before showing migration modal.
                    if (rawAmount > BigInt(0) && rawAmount < dustRawThreshold) continue;

                    // Get CNGN rate for this specific chain if needed
                    const isCNGN = symbol.toUpperCase() === "CNGN";
                    const chainRate = isCNGN ? chainRates[chainName] : undefined;
                    let usdValue = balanceNum;
                    if (isCNGN && chainRate) {
                        usdValue = balanceNum / chainRate;
                    }
                    if (usdValue < DUST_USD_THRESHOLD) continue;

                    const token = {
                        id: `${chainName}-${symbol}`,
                        chain: chainName,
                        name: tokenMeta.name || symbol,
                        symbol,
                        amount: balanceNum,
                        rawAmount,
                        displayAmount: balanceNum.toFixed(2),
                        value: `${usdValue.toFixed(2)}`,
                        icon: `/logos/${symbol.toLowerCase()}-logo.svg`,
                        address: tokenMeta.address,
                        decimals,
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
    }, [allChainBalances, allChainRawBalances, allTokens, chainRates]);

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

    const handleCloseSuccessModal = () => {
        setShowSuccessModal(false);
        window.location.reload();
    };

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
            const getAccessTokenWithRetry = async (): Promise<string> => {
                // Token can be temporarily unavailable right after auth/wallet operations.
                const tryGet = async () => (await getAccessToken()) ?? "";
                let token = await tryGet();
                if (token) return token;
                await new Promise((resolve) => setTimeout(resolve, 400));
                token = await tryGet();
                if (token) return token;
                await new Promise((resolve) => setTimeout(resolve, 700));
                token = await tryGet();
                if (!token) {
                    throw new Error("Failed to get access token. Please re-login and try again.");
                }
                return token;
            };

            const allTxHashes: string[] = [];
            const chains = Object.keys(tokensByChain);
            let totalTokensMigrated = 0;

            // ✅ If tokens exist: (1) upgrade SCW to Nexus via upgrade-server, then (2) use MEE to transfer.
            if (hasTokens) {
                const meeApiKey = config.biconomyMeeApiKey;
                const bundlerServerUrl = config.bundlerServerUrl.trim().replace(/\/+$/, "");
                if (!meeApiKey) {
                    throw new Error("Biconomy MEE API key not configured. Set NEXT_PUBLIC_BICONOMY_MEE_API_KEY.");
                }
                if (!bundlerServerUrl) {
                    throw new Error("Upgrade server URL not configured. Set NEXT_PUBLIC_UPGRADE_SERVER_URL.");
                }
                try {
                    const parsed = new URL(bundlerServerUrl);
                    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
                        throw new Error("invalid protocol");
                    }
                } catch {
                    throw new Error("Invalid NEXT_PUBLIC_BUNDLER_SERVER_URL. Use a full URL");
                }
                if (!embeddedWallet || !oldAddress) {
                    throw new Error("Wallet not available. Please ensure you are logged in.");
                }

                // --- For each chain: check nexus status, upgrade if needed, then transfer via MEE ---
                for (let i = 0; i < chains.length; i++) {
                    const chainName = chains[i];
                    const chainTokens = tokensByChain[chainName];
                    const chain = CHAIN_MAP[chainName];

                    if (!chain || !newAddress || !oldAddress) {
                        if (!chain) console.warn(`Chain ${chainName} not supported, skipping...`);
                        continue;
                    }

                    setProgress(`Processing ${chainName} (${i + 1}/${chains.length})...`);

                    try {
                        setProgress(`Preparing migration on ${chainName}...`);
                        await embeddedWallet.switchChain(chain.id);
                        const chainProvider = await embeddedWallet.getEthereumProvider();
                        const chainRpcUrl = getRpcUrl(chain.name);

                        setProgress(`Checking wallet version on ${chainName}...`);
                        const statusUrl = `${bundlerServerUrl}/is-nexus?smartAccountAddress=${encodeURIComponent(oldAddress)}&chainId=${chain.id}${chainRpcUrl ? `&rpcUrl=${encodeURIComponent(chainRpcUrl)}` : ""}`;
                        const statusRes = await fetch(statusUrl);
                        if (!statusRes.ok) {
                            const errText = await statusRes.text();
                            throw new Error(`Nexus check failed on ${chainName}: ${errText || statusRes.statusText}`);
                        }
                        const statusData = (await statusRes.json()) as {
                            isNexus?: boolean;
                            accountId?: string;
                        };
                        const alreadyNexus = Boolean(statusData?.isNexus);

                        if (!alreadyNexus) {
                            setProgress(`Upgrading wallet to Nexus on ${chainName}...`);
                            const genRes = await fetch(`${bundlerServerUrl}/generate-userop`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    smartAccountAddress: oldAddress,
                                    ownerAddress: embeddedWallet.address,
                                    chainId: chain.id,
                                    rpcUrl: chainRpcUrl,
                                }),
                            });
                            if (!genRes.ok) {
                                const errText = await genRes.text();
                                let msg = errText || genRes.statusText;
                                try {
                                    const j = JSON.parse(errText) as { error?: string };
                                    if (j?.error) msg = j.error;
                                } catch {
                                    /* use errText as-is */
                                }
                                throw new Error(`Upgrade prepare failed on ${chainName}: ${msg}`);
                            }
                            const { userOp: unsignedUserOp, userOpHash } = (await genRes.json()) as {
                                userOp: Record<string, unknown> & { signature?: string };
                                userOpHash: string;
                            };
                            if (!unsignedUserOp || !userOpHash) {
                                throw new Error(`Invalid upgrade response on ${chainName} (missing userOp or userOpHash)`);
                            }

                            setProgress(`Signing upgrade on ${chainName}...`);
                            const rawSignature = (await chainProvider.request({
                                method: "personal_sign",
                                params: [userOpHash, embeddedWallet.address],
                            })) as string;
                            const signature = encodeAbiParameters(
                                [{ type: "bytes" }, { type: "address" }],
                                [rawSignature as `0x${string}`, BICONOMY_V2_ECDSA_MODULE as Address]
                            );
                            const signedUserOp = { ...unsignedUserOp, signature };

                            setProgress(`Submitting upgrade on ${chainName}...`);
                            const execRes = await fetch(`${bundlerServerUrl}/execute`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    userOp: signedUserOp,
                                    smartAccountAddress: oldAddress,
                                    chainId: chain.id,
                                    rpcUrl: chainRpcUrl,
                                }),
                            });
                            if (!execRes.ok) {
                                const errText = await execRes.text();
                                throw new Error(`Upgrade execute failed on ${chainName}: ${errText || execRes.statusText}`);
                            }
                            const execData = (await execRes.json()) as { transactionHash?: string };
                            if (execData.transactionHash) allTxHashes.push(execData.transactionHash);
                            toast.success(`Wallet upgraded to Nexus on ${chainName}`);
                        }

                        const nexusAccount = await toMultichainNexusAccount({
                            chainConfigurations: [
                                {
                                    chain,
                                    transport: http(chainRpcUrl),
                                    version: getMEEVersion(MEEVersion.V2_1_0),
                                    accountAddress: oldAddress as `0x${string}`,
                                },
                            ],
                            signer: chainProvider,
                        });

                        const meeClient = await createMeeClient({
                            account: nexusAccount,
                            apiKey: meeApiKey,
                        });

                        // Transfer full raw balance so users don't lose meaningful dust (e.g. 50 -> 49.995).
                        const instructions = await Promise.all(
                            chainTokens.map((token) => {
                                const raw = token.rawAmount as bigint;
                                return nexusAccount.buildComposable({
                                    type: "default",
                                    data: {
                                        abi: erc20Abi,
                                        chainId: chain.id,
                                        to: token.address as `0x${string}`,
                                        functionName: "transfer",
                                        args: [newAddress as Address, raw],
                                    },
                                });
                            })
                        );

                        if (instructions.length === 0) {
                            console.warn(`No tokens to migrate on ${chainName}`);
                            continue;
                        }

                        setProgress(`Submitting transfer on ${chainName}...`);

                        const { hash: supertxHash } = await meeClient.execute({
                            // Upgraded account is already a Nexus smart account; use regular sponsored smart-account execution.
                            sponsorship: true,
                            instructions,
                        });

                        setProgress(`Confirming on ${chainName}... (may take 1–2 min)`);

                        const MEE_WAIT_TIMEOUT_MS = 120_000; // 2 min max so we don't hang
                        const receipt = await Promise.race([
                            meeClient.waitForSupertransactionReceipt({
                                hash: supertxHash,
                                waitForReceipts: true,
                                confirmations: 1,
                            }),
                            new Promise<never>((_, reject) =>
                                setTimeout(
                                    () =>
                                        reject(
                                            new Error(
                                                `Confirmation is taking longer than expected. You can check status at https://meescan.biconomy.io/details/${supertxHash} or try again.`
                                            )
                                        ),
                                    MEE_WAIT_TIMEOUT_MS
                                )
                            ),
                        ]);

                        // SDK throws on FAILED/MINED_FAIL; double-check receipt when we have it
                        const status = (receipt as { transactionStatus?: string; message?: string }).transactionStatus;
                        const statusMessage = (receipt as { message?: string }).message;
                        if (status === "FAILED" || status === "MINED_FAIL") {
                            throw new Error(statusMessage || "Transaction failed on chain");
                        }

                        const onChainTxHash =
                            (receipt.receipts?.[0] as { transactionHash?: `0x${string}` } | undefined)?.transactionHash ??
                            (receipt.userOps?.[0] as { executionData?: `0x${string}` } | undefined)?.executionData ??
                            supertxHash;
                        allTxHashes.push(onChainTxHash as string);

                        totalTokensMigrated += instructions.length;
                        toast.success(`${chainName} migration complete!`, {
                            description: `${instructions.length} token${instructions.length === 1 ? "" : "s"} transferred to your new wallet.`,
                        });
                    } catch (chainError) {
                        const rawMsg = chainError instanceof Error ? chainError.message : "Unknown error";
                        const isDeadlineOrRevert =
                            /deadline limit exceeded|revert|transaction failed/i.test(rawMsg);
                        const description = isDeadlineOrRevert
                            ? "Simulation reverted or timed out. Try again, or transfer a slightly smaller amount. You can also check status at meescan.biconomy.io."
                            : rawMsg;
                        setError(rawMsg);
                        toast.error(`Failed to migrate ${chainName}`, {
                            description,
                        });
                    }
                }
            } // End of hasTokens block

            if (hasTokens && totalTokensMigrated === 0) {
                throw new Error("All token transfers failed. Please try again.");
            }

            setProgress("Finalizing migration...");
            const accessToken = await getAccessTokenWithRetry();

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
                const errText = await response.text().catch(() => "");
                throw new Error(`Failed to update backend${errText ? `: ${errText}` : ""}`);
            }

            toast.success("🎉 Migration Complete!", {
                description: hasTokens
                    ? `${totalTokensMigrated} token${totalTokensMigrated === 1 ? '' : 's'} successfully migrated to your new wallet`
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

                                        <div className="relative -mt-6 w-full overflow-y-auto rounded-t-[24px] bg-white p-5 text-text-body sm:max-h-[90vh] dark:bg-[#363636] dark:text-white">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <span className="text-base font-semibold">Wallet</span>
                                                    <div className="flex items-center gap-2 pt-2">
                                                        <Wallet01Icon className="h-5 w-5 text-text-secondary dark:text-white/60" strokeWidth={2} />
                                                        <span
                                                            className="font-[Inter] text-sm font-light leading-5 tracking-normal text-text-body align-middle dark:text-[#FFFFFF]"
                                                        >
                                                            {displayOldAddress}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Old Wallet Balance Card */}
                                                <div className="space-y-3  p-4 dark:border-white/10 text-right">
                                                    <span
                                                        className="font-[Inter] text-sm font-light leading-5 tracking-normal text-text-secondary dark:text-[#FFFFFF80]"
                                                    >
                                                        Total wallet balance
                                                    </span>
                                                    <div
                                                        className="font-[Inter] text-2xl font-medium leading-9 tracking-tight text-text-body align-middle dark:text-[#FFFFFF]"

                                                    >
                                                        {isLoading ? "..." : totalBalance}
                                                    </div>
                                                </div>
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

                                            {/* Token List - Each Network gets its own card */}
                                            <div className="mb-4 space-y-3">
                                                {isFetchingBalances || isLoading ? (
                                                    <div className="text-sm text-text-secondary dark:text-white/50">Loading balances from all networks...</div>
                                                ) : Object.keys(tokensByChain).length === 0 ? (
                                                    <div className="text-sm text-text-secondary dark:text-white/50">No tokens found</div>
                                                ) : (
                                                    Object.entries(tokensByChain).map(([chainName, chainTokens]) => (
                                                        <div key={chainName} className="rounded-3xl bg-background-neutral p-4 dark:bg-[#2C2C2C]">
                                                            {/* Network Title */}
                                                            <div className="mb-3">
                                                                <h3 className="text-sm font-light text-text-body dark:text-[#FFFFFFCC] capitalize">
                                                                    {chainName}
                                                                </h3>
                                                            </div>

                                                            {/* Network Tokens */}
                                                            <div className="space-y-2">
                                                                {chainTokens.map((token) => (
                                                                    <div key={token.id} className="flex items-center gap-3 py-1">
                                                                        <div className="relative flex-shrink-0">
                                                                            <Image
                                                                                src={token.icon}
                                                                                alt={token.name}
                                                                                width={24}
                                                                                height={24}
                                                                                className="size-6 rounded-full"
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
                                                                                        width={8}
                                                                                        height={8}
                                                                                        className="absolute -bottom-1 -right-1 size-3 rounded-full border border-white dark:border-gray-800"
                                                                                    />
                                                                                );
                                                                            })()}
                                                                        </div>
                                                                        <span className="font-[Inter] text-sm font-light text-text-body dark:text-white/90">
                                                                            {token.displayAmount} {token.symbol}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>

                                            {/* Info Banner */}
                                            <div className="mb-6 flex items-start gap-2.5 rounded-2xl border border-border-light bg-accent-gray p-4 dark:border-white/10 dark:bg-[#3c3a38]">
                                                {/* <InformationCircleIcon */}
                                                <InformationSquareIcon
                                                    className="mt-0.5 h-5 w-5 flex-shrink-0 text-text-secondary dark:text-white/60"
                                                    strokeWidth={2}
                                                />
                                                <p className="text-sm font-normal leading-5 tracking-normal text-text-secondary dark:text-white/50">
                                                    Your funds are safe, they are being transferred to your new secured wallet address{" "}
                                                    <span className="font-normal text-sm text-text-body dark:text-white/80">{displayNewAddress}</span>
                                                </p>
                                            </div>

                                            {/* Error */}
                                            {error && (
                                                <div className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                                                    {error}
                                                </div>
                                            )}

                                            {/* Approve Transfer Button - enabled even with 0 balance (deprecate-only migration) */}
                                            <button
                                                onClick={handleApproveTransfer}
                                                disabled={isProcessing || isLoading || isFetchingBalances}
                                                className="w-full rounded-xl bg-lavender-500 px-4 py-3.5 text-center text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity sm:px-6"
                                            >
                                                <span className="block truncate">
                                                    {isProcessing ? progress || "Processing..." : isFetchingBalances ? "Loading balances..." : tokens.length === 0 ? "Complete migration" : "Approve transfer"}
                                                </span>
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