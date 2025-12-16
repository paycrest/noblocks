"use client";
import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Dialog, DialogPanel } from "@headlessui/react";
import { Cancel01Icon, Wallet01Icon, InformationCircleIcon } from "hugeicons-react";
import Image from "next/image";
import { useBalance } from "../context/BalanceContext";
import { useTokens } from "../context";
import { useNetwork } from "../context/NetworksContext";
import { useInjectedWallet } from "../context";
import { usePrivy } from "@privy-io/react-auth";
import { formatCurrency, shortenAddress, getNetworkImageUrl } from "../utils";
import { useActualTheme } from "../hooks/useActualTheme";
import { useCNGNRate } from "../hooks/useCNGNRate";

interface WalletTransferApprovalModalProps {
    isOpen: boolean;
    onClose: () => void;
    onApprove: () => void;
    walletAddress?: string;
    newWalletAddress?: string;
}

const WalletTransferApprovalModal: React.FC<WalletTransferApprovalModalProps> = ({
    isOpen,
    onClose,
    onApprove,
    walletAddress,
    newWalletAddress = "0xa5...1eb1024",
}) => {
    const { selectedNetwork } = useNetwork();
    const { allBalances, isLoading } = useBalance();
    const { allTokens } = useTokens();
    const { isInjectedWallet, injectedAddress } = useInjectedWallet();
    const { user } = usePrivy();
    const isDark = useActualTheme();

    // Get CNGN rate for conversion
    const {
        rate,
        isLoading: isRateLoading,
    } = useCNGNRate({
        network: selectedNetwork.chain.name,
        dependencies: [selectedNetwork],
    });

    // Determine active wallet based on wallet type
    const activeWallet = isInjectedWallet
        ? { address: injectedAddress }
        : user?.linkedAccounts.find((account) => account.type === "smart_wallet");

    // Get appropriate balance based on wallet type
    const activeBalance = isInjectedWallet
        ? allBalances.injectedWallet
        : allBalances.smartWallet;

    // Use provided wallet address or fall back to active wallet address
    const displayWalletAddress = walletAddress || shortenAddress(activeWallet?.address ?? "", 6);

    // Format total balance
    const totalBalance = formatCurrency(activeBalance?.total ?? 0, "USD", "en-US");

    // Get tokens from balance and format them
    const tokens = React.useMemo(() => {
        if (!activeBalance?.balances) return [];

        const fetchedTokens = allTokens[selectedNetwork.chain.name] || [];

        return Object.entries(activeBalance.balances)
            .filter(([_, balance]) => (balance as number) > 0)
            .map(([tokenSymbol, balance]) => {
                const token = fetchedTokens.find(
                    (t) => t.symbol.toUpperCase() === tokenSymbol.toUpperCase()
                );

                const balanceNum = balance as number;
                const tokenName = token?.name || tokenSymbol;

                // Calculate USD value
                let usdValue = 0;
                if (tokenSymbol.toUpperCase() === "CNGN" && rate) {
                    usdValue = balanceNum / rate;
                } else {
                    usdValue = balanceNum;
                }

                return {
                    id: tokenSymbol,
                    name: tokenName,
                    symbol: tokenSymbol,
                    amount: balanceNum.toFixed(2),
                    value: `$${usdValue.toFixed(2)}`,
                    change: "+0.00%", // Mock change - in real implementation, this would come from price data
                    changePositive: true,
                    icon: `/logos/${tokenSymbol.toLowerCase()}-logo.svg`,
                };
            });
    }, [activeBalance, allTokens, selectedNetwork, rate]);

    return (
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
                            transition={{
                                type: "spring",
                                stiffness: 300,
                                damping: 30,
                            }}
                            className="w-full"
                        >
                            <DialogPanel className="relative mx-auto w-full max-w-md sm:max-w-[28rem]">
                                <motion.div
                                    layout
                                    initial={false}
                                    className="relative overflow-hidden rounded-t-[30px] bg-white sm:rounded-3xl dark:bg-neutral-900"
                                >
                                    {/* Gradient Header */}
                                    <div
                                        className="relative h-20 w-full"
                                        style={{
                                            background:
                                                "linear-gradient(90deg, #746F0D 0%, #164D81 50%, #361E64 100%)",
                                        }}
                                    >
                                        <button
                                            onClick={onClose}
                                            className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                                            aria-label="Close modal"
                                        >
                                            <Cancel01Icon className="h-5 w-5" strokeWidth={2} />
                                        </button>
                                    </div>

                                    {/* Content */}
                                    <div className="relative -mt-6 w-full overflow-y-auto rounded-t-[24px] bg-white p-5 pt-6 text-text-body sm:max-h-[90vh] dark:bg-[#2C2C2C] dark:text-white">
                                        {/* Title */}
                                        <h2 className="mb-6 text-xl font-semibold text-text-body dark:text-white">
                                            Wallet
                                        </h2>

                                        {/* Wallet Balance Card*/}
                                        <div className="mb-4 space-y-3 rounded-[20px] border border-border-light p-4 dark:border-white/10">
                                            {/* Wallet Address */}
                                            <div className="flex items-center gap-2">
                                                <Wallet01Icon className="h-5 w-5 text-text-secondary dark:text-white/60" strokeWidth={2} />
                                                <span className="text-sm font-normal text-text-body dark:text-white/80">
                                                    {displayWalletAddress}
                                                </span>
                                            </div>

                                            {/* Balance Label */}
                                            <div className="text-sm font-normal text-text-secondary dark:text-white/50">
                                                Total wallet balance
                                            </div>

                                            {/* Total Balance */}
                                            <div className="text-3xl font-semibold text-text-body dark:text-white">
                                                {isLoading ? "..." : totalBalance}
                                            </div>
                                        </div>

                                        {/* Cryptocurrency List */}
                                        <div className="mb-4 space-y-3">
                                            {isLoading ? (
                                                <div className="text-sm text-text-secondary dark:text-white/50">Loading balances...</div>
                                            ) : tokens.length === 0 ? (
                                                <div className="text-sm text-text-secondary dark:text-white/50">No tokens found</div>
                                            ) : (
                                                tokens.map((token) => (
                                                    <div
                                                        key={token.id}
                                                        // className="flex items-center justify-between rounded-2xl border border-border-light bg-white p-4 dark:border-white/10 dark:bg-[#373636]"
                                                        className="flex items-center justify-between rounded-2xl py-4"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            {/* Token Icon with Network Overlay */}
                                                            <div className="relative">
                                                                <Image
                                                                    src={token.icon}
                                                                    alt={token.name}
                                                                    width={32}
                                                                    height={32}
                                                                    className="size-10 rounded-full"
                                                                    onError={(e) => {
                                                                        // Fallback if image doesn't exist
                                                                        (e.target as HTMLImageElement).style.display = 'none';
                                                                    }}
                                                                />
                                                                <Image
                                                                    src={getNetworkImageUrl(
                                                                        selectedNetwork,
                                                                        isDark,
                                                                    )}
                                                                    alt={selectedNetwork.chain.name}
                                                                    width={16}
                                                                    height={16}
                                                                    className="absolute -bottom-1 -right-1 size-6 rounded-full"
                                                                />
                                                            </div>

                                                            {/* Token Info */}
                                                            <div className="flex flex-col">
                                                                <span className="text-sm font-normal text-text-body dark:text-white">
                                                                    {token.name}
                                                                </span>
                                                                <span className="text-sm font-normal text-text-secondary dark:text-white/50">
                                                                    {token.amount} {token.symbol}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Token Value and Change */}
                                                        <div className="flex flex-col items-end">
                                                            <span className="text-sm font-medium text-text-body dark:text-white">
                                                                {token.value}
                                                            </span>
                                                            <span
                                                                className={`text-sm font-normal ${token.changePositive
                                                                    ? "text-green-500"
                                                                    : "text-red-500"
                                                                    }`}
                                                            >
                                                                {token.change}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>

                                        {/* Information Banner */}
                                        <div className="mb-6 flex items-start gap-2.5 rounded-2xl border border-border-light bg-accent-gray p-4 dark:border-white/10 dark:bg-[#3c3a38]">
                                            <InformationCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-text-secondary dark:text-white/60" strokeWidth={2} />
                                            <p className="text-sm font-normal leading-relaxed text-text-body dark:text-white/70">
                                                Your funds are safe, they are being transferred to
                                                your new secured wallet address{" "}
                                                <span className="font-semibold">
                                                    {newWalletAddress}
                                                </span>
                                            </p>
                                        </div>

                                        {/* Approve Transfer Button */}
                                        <button
                                            onClick={onApprove}
                                            className="w-full rounded-xl bg-lavender-500 px-6 py-3.5 text-base font-semibold text-white transition-all hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-white active:opacity-80 dark:focus:ring-offset-neutral-900"
                                        >
                                            Approve transfer
                                        </button>
                                    </div>
                                </motion.div>
                            </DialogPanel>
                        </motion.div>
                    </div>
                </Dialog>
            )}
        </AnimatePresence>
    );
};

export default WalletTransferApprovalModal;