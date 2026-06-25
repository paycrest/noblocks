"use client";
import { Dialog, DialogPanel } from "@headlessui/react";
import { AnimatePresence, motion } from "framer-motion";
import { useState, useEffect } from "react";
import { usePrivy, useMfaEnrollment, useWallets } from "@privy-io/react-auth";
import { useNetwork } from "../context/NetworksContext";
import { useBalance, useTokens, useStarknet, useTron } from "../context";
import {
  copyToClipboard,
  detectWalletProvider,
  handleNetworkSwitch,
} from "../utils";
import { useLogout } from "@privy-io/react-auth";
import { resetNetworkModalDismissed } from "../lib/networkModalStore";
import { toast } from "sonner";
import { useStep } from "../context/StepContext";
import { STEPS, type MobileSheetView } from "../types";
import { useFundWalletHandler } from "../hooks/useFundWalletHandler";
import { useInjectedWallet } from "../context";
import { useWalletDisconnect } from "../hooks/useWalletDisconnect";
import { toastMappedError } from "../lib/toastMappedError";
import { useActualTheme } from "../hooks/useActualTheme";
import { useSortedCrossChainBalances } from "../hooks/useSortedCrossChainBalances";
import { useWalletAddress } from "../hooks/useWalletAddress";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { useTransactions } from "../context/TransactionsContext";
import { networks } from "../mocks";
import { Network, Token, TransactionHistory } from "../types";
import {
  WalletView,
  HistoryView,
  SettingsView,
  EarnHubView,
  EarnActivityDetailView,
  ReferralHubView,
} from "./wallet-mobile-modal";
import { slideUpAnimation } from "./AnimatedComponents";
import { FundWalletForm } from "./FundWalletForm";
import { TransferForm } from "./TransferForm";
import { EarnWalletForm } from "./EarnWalletForm";
import { EarnConsentModal } from "./EarnConsentModal";
import { CopyAddressWarningModal } from "./CopyAddressWarningModal";
import ProfileDrawer from "./ProfileDrawer";
import WalletMigrationModal from "./WalletMigrationModal";
import { useEarnAccess } from "../hooks/useEarnAccess";
import { isEarnUiVisible } from "../lib/earnFeature";
import { isReferralEnabled } from "../utils";
import type { EarnActivityEntry } from "../hooks/useEarnHandler";
import { useShouldUseEOA } from "../hooks/useEIP7702Account";
import { useHandleExportEmbeddedWallet } from "../hooks/useHandleExportEmbeddedWallet";
import { clearUserSessionData } from "../lib/session-cleanup";

export const MobileDropdown = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  const [currentView, setCurrentView] = useState<MobileSheetView>("wallet");
  const [selectedEarnActivity, setSelectedEarnActivity] =
    useState<EarnActivityEntry | null>(null);
  const [earnActivityReturnView, setEarnActivityReturnView] =
    useState<Extract<MobileSheetView, "wallet" | "earn">>("wallet");
  const [isNetworkListOpen, setIsNetworkListOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isWarningModalOpen, setIsWarningModalOpen] = useState(false);
  const [isMigrationModalOpen, setIsMigrationModalOpen] = useState(false);
  const [isProfileDrawerOpen, setIsProfileDrawerOpen] = useState(false);

  const { selectedNetwork, setSelectedNetwork } = useNetwork();
  const { currentStep } = useStep();

  const { user, linkEmail, updateEmail } = usePrivy();
  const handleExportEmbeddedWallet = useHandleExportEmbeddedWallet();
  const { allBalances, crossChainBalances, crossChainTotal, isLoading, isRefreshing, refreshBalance } = useBalance();
  const { allTokens } = useTokens();
  const { ensureWalletExists: ensureStarknetWallet } = useStarknet();
  const { ensureWalletExists: ensureTronWallet } = useTron();
  const { logout } = useLogout({
    onSuccess: () => {
      setIsLoggingOut(false);
      resetNetworkModalDismissed();
    },
  });
  const { isInjectedWallet, injectedAddress } = useInjectedWallet();
  const shouldUseEOA = useShouldUseEOA();
  const { wallets } = useWallets();
  const walletAddress = useWalletAddress();

  const embeddedWallet = wallets.find(
    (wallet) => wallet.walletClientType === "privy",
  );
  const smartWallet = user?.linkedAccounts.find(
    (account) => account.type === "smart_wallet",
  );

  const activeWallet = isInjectedWallet
    ? { address: injectedAddress, type: "injected_wallet" as const }
    : selectedNetwork.chain.name === "Starknet" ||
        selectedNetwork.chain.name === "Tron"
      ? walletAddress
        ? { address: walletAddress, type: "smart_wallet" as const }
        : undefined
      : shouldUseEOA
        ? embeddedWallet
          ? { address: embeddedWallet.address, type: "eoa" as const }
          : undefined
        : smartWallet;

  const { handleFundWallet } = useFundWalletHandler("Mobile menu");

  const walletForCopy = activeWallet;

  const { disconnectWallet } = useWalletDisconnect();

  const { showMfaEnrollmentModal } = useMfaEnrollment();

  const handleCopyAddress = async () => {
    if (!walletForCopy?.address) return;
    const ok = await copyToClipboard(walletForCopy.address, "Address");
    if (!ok) return;
    setIsWarningModalOpen(true);
  };

  const tokens: { name: string; imageUrl: string | undefined }[] = [];
  const fetchedTokens: Token[] = allTokens[selectedNetwork.chain.name] || [];
  for (const token of fetchedTokens) {
    tokens.push({
      name: token.symbol,
      imageUrl: token.imageUrl,
    });
  }

  const getTokenImageUrl = (tokenName: string) => {
    const token = tokens.find((token) => token.name === tokenName);
    return token ? token.imageUrl : "";
  };

  const handleFundWalletClick = async (
    amount: string,
    tokenAddress: `0x${string}`,
    onComplete?: (success: boolean) => void,
  ) => {
    if (!walletForCopy?.address) return;
    await handleFundWallet(
      walletForCopy.address,
      amount,
      tokenAddress,
      onComplete,
    );
  };

  // Get appropriate balance based on migration status
  const activeBalance = isInjectedWallet
    ? allBalances.injectedWallet
    : selectedNetwork.chain.name === "Starknet"
      ? allBalances.starknetWallet
      : selectedNetwork.chain.name === "Tron"
        ? allBalances.tronWallet
        : shouldUseEOA
          ? allBalances.externalWallet
          : allBalances.smartWallet;
  // Sort cross-chain balances: selected network first, then alphabetically
  const sortedCrossChainBalances = useSortedCrossChainBalances(
    crossChainBalances,
    selectedNetwork.chain.name,
  );

  const handleNetworkSwitchWrapper = (network: Network) => {
    if (currentStep !== STEPS.FORM) {
      toast.error("Cannot switch networks during an active transaction");
      return;
    }

    handleNetworkSwitch(
      network,
      isInjectedWallet,
      setSelectedNetwork,
      () => {
        if (!isInjectedWallet) {
          toast("Network switched successfully", {
            description: `You are now swapping on ${network.chain.name} network`,
          });
        }
      },
      (error) => {
        console.error("Failed to switch network:", error);
        toastMappedError(error, {
          feature: "network-switch",
          title: "Error switching network",
        });
      },
      async () => {
        if (network.chain.name === "Starknet") {
          await ensureStarknetWallet();
        } else if (network.chain.name === "Tron") {
          await ensureTronWallet();
        }
      },
    );

    setIsNetworkListOpen(false);
  };

  // Helper function for fallback fetch with timeout
  const trackLogoutWithFetch = (payload: {
    walletAddress: string;
    logoutMethod: string;
  }) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500); // 1.5s timeout

    fetch("/api/track-logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
      .catch((error) => {
        if (error.name !== "AbortError") {
          console.warn("Logout tracking failed:", error);
        }
      })
      .finally(() => {
        clearTimeout(timeoutId);
      });
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      clearUserSessionData(user?.id, user?.wallet?.address);
      await logout();

      if (window.ethereum) {
        try {
          await disconnectWallet();
        } catch (disconnectError) {
          console.warn("Wallet disconnect failed:", disconnectError);
        }
      }
    } catch (error) {
      console.error("Error during logout:", error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const isDark = useActualTheme();

  // Reset to wallet home whenever the sheet closes so reopening always starts fresh.
  useEffect(() => {
    if (!isOpen) setCurrentView("wallet");
  }, [isOpen]);

  // --- History state ---
  const [selectedTransaction, setSelectedTransaction] =
    useState<TransactionHistory | null>(null);
  const { clearTransactions } = useTransactions();
  useEffect(() => {
    if (currentView !== "history") clearTransactions();
  }, [currentView, clearTransactions]);

  // Reset nested views when the sheet closes so reopening always starts on Wallet
  useEffect(() => {
    if (!isOpen) {
      setCurrentView("wallet");
      setSelectedEarnActivity(null);
      setEarnActivityReturnView("wallet");
      setSelectedTransaction(null);
      setIsNetworkListOpen(false);
    }
  }, [isOpen]);

  const { client } = useSmartWallets();

  const showEarnUi = isEarnUiVisible(selectedNetwork.chain.name);
  const {
    isConsentModalOpen: isEarnConsentModalOpen,
    requestEarnAccess,
    handleConsentAccepted: handleEarnConsentAccepted,
    dismissConsent: dismissEarnConsent,
  } = useEarnAccess();

  const onEarnAccessAction = (
    action: "earn-modal" | "earn-tab" | "earn-hub",
  ) => {
    if (action === "earn-hub" || action === "earn-modal") {
      setCurrentView("earn");
    }
  };

  const walletBalanceUsd = crossChainTotal ?? 0;

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <Dialog
            open={isOpen}
            onClose={onClose}
            className="relative z-[60] max-h-[90vh] sm:hidden"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/30 backdrop-blur-sm"
            />

            <div className="fixed inset-0">
              <div className="flex h-full items-end">
                <motion.div {...slideUpAnimation} className="w-full">
                  <DialogPanel className="scrollbar-hide relative max-h-[90vh] w-full overflow-hidden rounded-t-[30px] border border-border-light bg-white px-5 pt-6 shadow-xl *:text-sm dark:border-white/5 dark:bg-surface-overlay">
                    <div
                      className={
                        currentView === "wallet"
                          ? "flex max-h-[90vh] flex-col overflow-hidden pb-12"
                          : "scrollbar-hide max-h-[90vh] overflow-y-scroll pb-12"
                      }
                    >
                      {currentView === "wallet" && (
                        <WalletView
                          isInjectedWallet={isInjectedWallet}
                          detectWalletProvider={detectWalletProvider}
                          isLoading={isLoading}
                          crossChainBalances={sortedCrossChainBalances}
                          getTokenImageUrl={getTokenImageUrl}
                          onTransfer={() => setCurrentView("transfer")}
                          onFund={() => setCurrentView("fund")}
                          smartWallet={walletForCopy}
                          handleCopyAddress={handleCopyAddress}
                          isNetworkListOpen={isNetworkListOpen}
                          setIsNetworkListOpen={setIsNetworkListOpen}
                          networks={networks}
                          selectedNetwork={selectedNetwork}
                          isDark={isDark}
                          handleNetworkSwitchWrapper={
                            handleNetworkSwitchWrapper
                          }
                          onSettings={() => setCurrentView("settings")}
                          onClose={onClose}
                          onHistory={() => setCurrentView("history")}
                          onRefreshBalance={refreshBalance}
                          isRefreshing={isRefreshing}
                          showEarnUi={showEarnUi}
                          walletBalanceUsd={walletBalanceUsd}
                          onEarn={() =>
                            requestEarnAccess("earn-hub", onEarnAccessAction)
                          }
                          onSelectTransaction={(tx) => {
                            setSelectedTransaction(tx);
                            setCurrentView("history");
                          }}
                          onViewReferrals={isReferralEnabled() ? () => setCurrentView("referrals") : undefined}
                        />
                      )}

                      {currentView === "referrals" && isReferralEnabled() && (
                        <ReferralHubView
                          onBack={() => setCurrentView("wallet")}
                          onClose={onClose}
                        />
                      )}

                      {currentView === "earn" && showEarnUi && (
                        <EarnHubView
                          onBack={() => setCurrentView("wallet")}
                          onClose={onClose}
                          onSettings={() => setCurrentView("settings")}
                          onDeposit={() => setCurrentView("earn-deposit")}
                          onWithdraw={() => setCurrentView("earn-withdraw")}
                          onSelectActivity={(entry) => {
                            setSelectedEarnActivity(entry);
                            setEarnActivityReturnView("earn");
                            setCurrentView("earn-activity-detail");
                          }}
                        />
                      )}

                      {currentView === "earn-deposit" && showEarnUi && (
                        <EarnWalletForm
                          layout="mobile"
                          showBackButton
                          initialTab="deposit"
                          onBack={() => setCurrentView("earn")}
                          onClose={onClose}
                        />
                      )}

                      {currentView === "earn-withdraw" && showEarnUi && (
                        <EarnWalletForm
                          layout="mobile"
                          showBackButton
                          initialTab="withdraw"
                          onBack={() => setCurrentView("earn")}
                          onClose={onClose}
                        />
                      )}

                      {currentView === "earn-activity-detail" &&
                        selectedEarnActivity && (
                          <EarnActivityDetailView
                            entry={selectedEarnActivity}
                            onBack={() => {
                              setSelectedEarnActivity(null);
                              setCurrentView(earnActivityReturnView);
                            }}
                          />
                        )}

                      {currentView === "settings" && (
                        <SettingsView
                          isInjectedWallet={isInjectedWallet}
                          showMfaEnrollmentModal={showMfaEnrollmentModal}
                          user={user}
                          updateEmail={updateEmail}
                          linkEmail={linkEmail}
                          exportWallet={handleExportEmbeddedWallet}
                          handleLogout={handleLogout}
                          isLoggingOut={isLoggingOut}
                          onBack={() => setCurrentView("wallet")}
                          onOpenProfile={() => {
                            onClose();
                            setIsProfileDrawerOpen(true);
                          }}
                        />
                      )}

                      {currentView === "transfer" && (
                        <div className="space-y-6">
                          <TransferForm
                            onClose={onClose}
                            showBackButton
                            setCurrentView={setCurrentView}
                            onOpenMigration={() => {
                              onClose();
                              setIsMigrationModalOpen(true);
                            }}
                          />
                        </div>
                      )}

                      {currentView === "fund" && (
                        <FundWalletForm
                          onClose={onClose}
                          showBackButton
                          setCurrentView={setCurrentView}
                        />
                      )}

                      {currentView === "history" && (
                        <HistoryView
                          selectedTransaction={selectedTransaction}
                          setSelectedTransaction={setSelectedTransaction}
                          handleHistoryClose={() => setCurrentView("wallet")}
                        />
                      )}
                    </div>
                  </DialogPanel>
                </motion.div>
              </div>
            </div>

            <EarnConsentModal
              isOpen={isEarnConsentModalOpen}
              onClose={dismissEarnConsent}
              onAccepted={() => handleEarnConsentAccepted(onEarnAccessAction)}
            />

            <CopyAddressWarningModal
              isOpen={isWarningModalOpen}
              onClose={() => setIsWarningModalOpen(false)}
              address={walletForCopy?.address ?? ""}
            />
          </Dialog>
        )}
      </AnimatePresence>

      <WalletMigrationModal
        isOpen={isMigrationModalOpen}
        onClose={() => setIsMigrationModalOpen(false)}
      />

      <ProfileDrawer
        isOpen={isProfileDrawerOpen}
        onClose={() => setIsProfileDrawerOpen(false)}
      />
    </>
  );
};
