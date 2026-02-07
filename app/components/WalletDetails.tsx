"use client";
import { useState, useEffect } from "react";
import {
  classNames,
  formatCurrency,
  getNetworkImageUrl,
  shortenAddress,
} from "../utils";
import { useBalance } from "../context/BalanceContext";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useNetwork } from "../context/NetworksContext";
import { useShouldUseEOA } from "../hooks/useEIP7702Account";
import {
  ArrowRight03Icon,
  Copy01Icon,
  Wallet01Icon,
  ArrowLeft02Icon,
  ArrowDown01Icon,
  RefreshIcon,
} from "hugeicons-react";
import Image from "next/image";
import { useFundWalletHandler } from "../hooks/useFundWalletHandler";
import { useInjectedWallet } from "../context";
import { toast } from "sonner";
import { Dialog } from "@headlessui/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  sidebarAnimation,
  fadeInOut,
  AnimatedModal,
} from "./AnimatedComponents";
import { TransactionDetails } from "./transaction/TransactionDetails";
import type { TransactionHistory } from "../types";
import { PiCheck } from "react-icons/pi";
import { BalanceSkeleton, BalanceCardSkeleton } from "./BalanceSkeleton";
import { useCNGNRate } from "../hooks/useCNGNRate";
import { useActualTheme } from "../hooks/useActualTheme";
import TransactionList from "./transaction/TransactionList";
import { FundWalletForm, TransferForm } from "./index";
import { CopyAddressWarningModal } from "./CopyAddressWarningModal";

export const WalletDetails = () => {
  const [isTransferModalOpen, setIsTransferModalOpen] =
    useState<boolean>(false);
  const [isFundModalOpen, setIsFundModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"balances" | "transactions">(
    "balances",
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] =
    useState<TransactionHistory | null>(null);
  const [isAddressCopied, setIsAddressCopied] = useState(false);
  const [isWarningModalOpen, setIsWarningModalOpen] = useState(false);

  const { selectedNetwork } = useNetwork();
  const { allBalances, isLoading, refreshBalance } = useBalance();
  const { isInjectedWallet, injectedAddress } = useInjectedWallet();
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const isDark = useActualTheme();
  const shouldUseEOA = useShouldUseEOA();

  // Custom hook for handling wallet funding
  const { handleFundWallet } = useFundWalletHandler("Wallet details");

  // Custom hook for CNGN rate fetching
  const {
    rate,
    isLoading: isRateLoading,
    error: rateError,
  } = useCNGNRate({
    network: selectedNetwork.chain.name,
    dependencies: [selectedNetwork],
  });

  // Get embedded wallet (EOA) and smart wallet (SCW)
  const embeddedWallet = wallets.find(
    (wallet) => wallet.walletClientType === "privy"
  );
  const smartWallet = user?.linkedAccounts.find(
    (account) => account.type === "smart_wallet"
  );

  // Determine active wallet based on migration status
  // After migration: show EOA (new wallet with funds)
  // Before migration: show SCW (old wallet)
  const activeWallet = isInjectedWallet
    ? { address: injectedAddress }
    : shouldUseEOA && embeddedWallet
      ? { address: embeddedWallet.address }
      : smartWallet;

  // Balance: EOA when shouldUseEOA (migrated or 0-balance SCW), else SCW
  const activeBalance = isInjectedWallet
    ? allBalances.injectedWallet
    : shouldUseEOA
      ? allBalances.externalWallet
      : allBalances.smartWallet;

  // Handler for funding wallet with specified amount and token
  const handleFundWalletClick = async (
    amount: string,
    tokenAddress: `0x${string}`,
    onComplete?: (success: boolean) => void,
  ) => {
    await handleFundWallet(
      activeWallet?.address ?? "",
      amount,
      tokenAddress,
      onComplete,
    );
  };

  // Close sidebar and reset selected transaction
  const handleSidebarClose = () => {
    setIsSidebarOpen(false);
    setSelectedTransaction(null);
  };

  // Copy wallet address to clipboard with feedback
  const handleCopyAddress = () => {
    navigator.clipboard.writeText(activeWallet?.address ?? "");
    setIsWarningModalOpen(true);
    setIsAddressCopied(true);
    toast.success("Address copied to clipboard");
    setTimeout(() => setIsAddressCopied(false), 2000);
  };

  // Reset selected transaction to show transaction list
  const handleBackToList = () => {
    setSelectedTransaction(null);
  };

  return (
    <>
      {/* Wallet balance button in header */}
      <button
        type="button"
        title="Wallet balance"
        onClick={() => {
          setIsSidebarOpen(!isSidebarOpen);
        }}
        className="flex h-9 items-center justify-center gap-2 rounded-xl bg-accent-gray px-2.5 py-2.5 transition-colors duration-300 hover:bg-border-light focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:bg-white/10 dark:hover:bg-white/20 dark:focus-visible:ring-offset-neutral-900 sm:py-0"
      >
        <Wallet01Icon className="size-5 text-icon-outline-secondary dark:text-white/50" />
        <div className="h-9 w-px border-r border-dashed border-border-light dark:border-white/10" />
        <div className="flex items-center gap-1.5 dark:text-white/80">
          {isLoading ? (
            <BalanceSkeleton />
          ) : (
            <p>{formatCurrency(activeBalance?.total ?? 0, "USD", "en-US")}</p>
          )}
          <ArrowDown01Icon
            aria-label="Caret down"
            className={classNames(
              "mx-1 size-4 text-icon-outline-secondary transition-transform duration-300 dark:text-white/50",
              isSidebarOpen ? "rotate-180" : "",
            )}
          />
        </div>
      </button>

      {/* Sidebar dialog for wallet details */}
      <AnimatePresence>
        {isSidebarOpen && (
          <Dialog
            as="div"
            className="fixed inset-0 z-50 overflow-hidden"
            onClose={handleSidebarClose}
            open={isSidebarOpen}
          >
            <div className="flex h-full">
              {/* Backdrop overlay */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/30 backdrop-blur-sm"
                onClick={handleSidebarClose}
              />

              {/* Sidebar content */}
              <motion.div
                {...sidebarAnimation}
                className="z-50 my-4 ml-auto mr-4 flex h-[calc(100%-32px)] w-full max-w-[396px] flex-col overflow-hidden rounded-[20px] border border-border-light bg-white shadow-lg dark:border-white/5 dark:bg-surface-overlay"
              >
                {selectedTransaction ? (
                  // Transaction details view for selected transaction
                  <div className="flex h-full flex-col p-6">
                    <div className="mb-6 flex items-center gap-3">
                      <button
                        type="button"
                        title="Back to transactions"
                        onClick={handleBackToList}
                        className="flex items-center gap-2 text-sm font-medium text-text-body dark:text-white"
                      >
                        <ArrowLeft02Icon className="size-5 text-outline-gray dark:text-white/50" />
                        Back
                      </button>
                    </div>
                    <div className="scrollbar-hide flex-1 overflow-y-auto">
                      <TransactionDetails transaction={selectedTransaction} />
                    </div>
                  </div>
                ) : (
                  // Main wallet view
                  <div className="flex h-full flex-col p-5">
                    {/* Header with close button */}
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-semibold text-text-body dark:text-white">
                        Wallet
                      </h2>
                      <button
                        type="button"
                        title="Close wallet details"
                        onClick={handleSidebarClose}
                        className="rounded-lg p-2 transition-colors hover:bg-accent-gray dark:hover:bg-white/10"
                      >
                        <ArrowRight03Icon className="size-5 text-outline-gray dark:text-white/50" />
                      </button>
                    </div>

                    {/* Wallet info card */}
                    <div className="mt-6 space-y-6 rounded-[20px] border border-border-light bg-transparent p-4 dark:border-white/10">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Wallet01Icon className="size-4 text-outline-gray dark:text-white/50" />
                          <p className="text-text-body dark:text-white/80">
                            {shortenAddress(activeWallet?.address ?? "", 8)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleCopyAddress}
                          title="Copy wallet address"
                          className="rounded-lg p-2 transition-colors hover:bg-accent-gray dark:hover:bg-white/10"
                        >
                          {isAddressCopied ? (
                            <PiCheck className="size-4 text-green-500" />
                          ) : (
                            <Copy01Icon className="size-4 text-outline-gray dark:text-white/50" />
                          )}
                        </button>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="text-2xl font-medium text-text-body dark:text-white">
                          {formatCurrency(
                            activeBalance?.total ?? 0,
                            "USD",
                            "en-US",
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await refreshBalance();
                            } catch (error) {
                              console.error("Error refreshing balance:", error);
                            }
                          }}
                          title="Refresh balance"
                          aria-label="Refresh balance"
                          disabled={isLoading}
                          className="rounded-lg p-2 transition-colors hover:bg-accent-gray disabled:opacity-50 dark:hover:bg-white/10"
                        >
                          <RefreshIcon
                            className={`size-5 text-outline-gray dark:text-white/50 ${isLoading ? "animate-spin" : ""}`}
                          />
                        </button>
                      </div>

                      {!isInjectedWallet && (
                        <div className="grid grid-cols-2 gap-4">
                          <button
                            type="button"
                            title="Transfer funds"
                            onClick={() => setIsTransferModalOpen(true)}
                            className="min-h-11 w-full rounded-xl bg-accent-gray py-2 text-sm font-medium text-gray-900 transition-all hover:scale-[0.98] hover:bg-[#EBEBEF] active:scale-95 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                          >
                            Transfer
                          </button>
                          <button
                            type="button"
                            title="Fund wallet"
                            onClick={() => setIsFundModalOpen(true)}
                            className="min-h-11 w-full rounded-xl bg-accent-gray py-2 text-sm font-medium text-gray-900 transition-all hover:scale-[0.98] hover:bg-[#EBEBEF] active:scale-95 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                          >
                            Fund
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Tab navigation */}
                    <div className="mt-6 flex items-center gap-6">
                      <button
                        type="button"
                        onClick={() => setActiveTab("balances")}
                        title="View balances"
                        className={classNames(
                          "text-sm font-medium transition-colors",
                          activeTab === "balances"
                            ? "text-text-body dark:text-white"
                            : "text-text-disabled dark:text-white/30",
                        )}
                      >
                        Balances
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab("transactions")}
                        title="View transactions"
                        className={classNames(
                          "text-sm font-medium transition-colors",
                          activeTab === "transactions"
                            ? "text-text-body dark:text-white"
                            : "text-text-disabled dark:text-white/30",
                        )}
                      >
                        Transactions
                      </button>
                    </div>

                    {/* Tab content */}
                    <div className="scrollbar-hide mt-6 w-full flex-grow overflow-y-scroll">
                      <AnimatePresence mode="wait">
                        {activeTab === "balances" ? (
                          // Balances tab content
                          <motion.div
                            key="balances"
                            variants={fadeInOut}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            className="h-full space-y-4 overflow-y-auto pb-16"
                          >
                            {isLoading ? (
                              <BalanceCardSkeleton />
                            ) : (
                              Object.entries(activeBalance?.balances || {}).map(
                                ([token, balance]) => (
                                  <div
                                    key={token}
                                    className="flex items-center justify-between text-sm"
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className="relative">
                                        <Image
                                          src={`/logos/${token.toLowerCase()}-logo.svg`}
                                          alt={token}
                                          width={32}
                                          height={32}
                                          className="size-8 rounded-full"
                                          priority
                                        />
                                        <Image
                                          src={getNetworkImageUrl(
                                            selectedNetwork,
                                            isDark,
                                          )}
                                          alt={selectedNetwork.chain.name}
                                          width={16}
                                          height={16}
                                          className="absolute -bottom-1 -right-1 size-4 rounded-full"
                                        />
                                      </div>
                                      <div className="flex flex-col">
                                        <span className="text-text-body dark:text-white/80">
                                          {token}
                                        </span>
                                        <span className="text-text-secondary dark:text-white/50">
                                          {balance}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex flex-col items-end">
                                      <span className="text-text-body dark:text-white/80">
                                        {token.toUpperCase() === "CNGN" ? (
                                          <span>
                                            $
                                            {(
                                              (balance || 0) / (rate || 1)
                                            ).toFixed(2)}
                                          </span>
                                        ) : (
                                          <span>
                                            ${(balance || 0).toFixed(2)}
                                          </span>
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                ),
                              )
                            )}
                          </motion.div>
                        ) : (
                          // Transactions tab content
                          <motion.div
                            key="transactions"
                            variants={fadeInOut}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            className="flex h-full flex-col items-center gap-4 text-center"
                          >
                            <TransactionList
                              onSelectTransaction={setSelectedTransaction}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                )}
              </motion.div>
            </div>
          </Dialog>
        )}
      </AnimatePresence>

      {/* Transfer and Fund modals */}
      {!isInjectedWallet && (
        <>
          <AnimatedModal
            isOpen={isTransferModalOpen}
            onClose={() => setIsTransferModalOpen(false)}
          >
            <TransferForm onClose={() => setIsTransferModalOpen(false)} />
          </AnimatedModal>

          <AnimatedModal
            isOpen={isFundModalOpen}
            onClose={() => setIsFundModalOpen(false)}
          >
            <FundWalletForm onClose={() => setIsFundModalOpen(false)} />
          </AnimatedModal>
        </>
      )}

      <CopyAddressWarningModal
        isOpen={isWarningModalOpen}
        onClose={() => setIsWarningModalOpen(false)}
        address={activeWallet?.address ?? ""}
      />
    </>
  );
};
