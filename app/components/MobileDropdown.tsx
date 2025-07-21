"use client";
import { Dialog, DialogPanel } from "@headlessui/react";
import { AnimatePresence, motion } from "framer-motion";
import { useState, useEffect } from "react";
import { usePrivy, useMfaEnrollment } from "@privy-io/react-auth";
import { useNetwork } from "../context/NetworksContext";
import { useBalance, useTokens } from "../context";
import { handleNetworkSwitch, detectWalletProvider } from "../utils";
import { useLogout } from "@privy-io/react-auth";
import { toast } from "sonner";
import { useStep } from "../context/StepContext";
import { STEPS } from "../types";
import { useFundWalletHandler } from "../hooks/useFundWalletHandler";
import { useInjectedWallet } from "../context";
import { useWalletDisconnect } from "../hooks/useWalletDisconnect";
import { useActualTheme } from "../hooks/useActualTheme";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { useTransactions } from "../context/TransactionsContext";
import { networks } from "../mocks";
import { Network, Token, TransactionHistory } from "../types";
import { WalletView, HistoryView, SettingsView } from "./wallet-mobile-modal";
import { slideUpAnimation } from "./AnimatedComponents";
import { FundWalletForm, TransferForm } from "./index";

export const MobileDropdown = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  const [currentView, setCurrentView] = useState<
    "wallet" | "settings" | "transfer" | "fund" | "history"
  >("wallet");
  const [isNetworkListOpen, setIsNetworkListOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const { selectedNetwork, setSelectedNetwork } = useNetwork();
  const { user, linkEmail, updateEmail } = usePrivy();
  const { allBalances, isLoading, refreshBalance } = useBalance();
  const { allTokens } = useTokens();
  const { logout } = useLogout({
    onSuccess: () => {
      setIsLoggingOut(false);
    },
  });
  const { isInjectedWallet, injectedAddress } = useInjectedWallet();

  const { handleFundWallet } = useFundWalletHandler("Mobile menu");

  const smartWallet = isInjectedWallet
    ? { address: injectedAddress }
    : user?.linkedAccounts.find((account) => account.type === "smart_wallet");

  const { currentStep } = useStep();

  const { disconnectWallet } = useWalletDisconnect();

  const { showMfaEnrollmentModal } = useMfaEnrollment();

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(smartWallet?.address ?? "");
    toast.success("Address copied to clipboard");
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
    await handleFundWallet(
      smartWallet?.address ?? "",
      amount,
      tokenAddress,
      onComplete,
    );
  };

  const activeBalance = isInjectedWallet
    ? allBalances.injectedWallet
    : allBalances.smartWallet;

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
        toast.error("Error switching network", {
          description: error.message,
        });
      },
    );

    setIsNetworkListOpen(false);
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      // Disconnect external wallet if connected
      await logout();
      if (window.ethereum) {
        await disconnectWallet();
      }
    } catch (error) {
      console.error("Error during logout:", error);
      // Still proceed with logout even if wallet disconnection fails
      await logout();
    }
  };

  const isDark = useActualTheme();

  // --- History state ---
  const [selectedTransaction, setSelectedTransaction] =
    useState<TransactionHistory | null>(null);
  const { clearTransactions } = useTransactions();
  useEffect(() => {
    if (currentView !== "history") clearTransactions();
  }, [currentView, clearTransactions]);

  const { client } = useSmartWallets();

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
                  <DialogPanel className="scrollbar-hide relative max-h-[90vh] w-full overflow-visible rounded-t-[30px] border border-border-light bg-white px-5 pt-6 shadow-xl *:text-sm dark:border-white/5 dark:bg-surface-overlay">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={currentView}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{
                          height: { duration: 0.35 },
                          opacity: { duration: 0.2 },
                        }}
                        style={{ overflow: "hidden" }}
                      >
                        <div className="scrollbar-hide max-h-[90vh] overflow-y-scroll pb-12">
                          {currentView === "wallet" && (
                            <WalletView
                              isInjectedWallet={isInjectedWallet}
                              detectWalletProvider={detectWalletProvider}
                              isLoading={isLoading}
                              activeBalance={activeBalance}
                              getTokenImageUrl={getTokenImageUrl}
                              onTransfer={() => setCurrentView("transfer")}
                              onFund={() => setCurrentView("fund")}
                              smartWallet={smartWallet}
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
                              setSelectedNetwork={setSelectedNetwork}
                            />
                          )}

                          {currentView === "settings" && (
                            <SettingsView
                              isInjectedWallet={isInjectedWallet}
                              showMfaEnrollmentModal={showMfaEnrollmentModal}
                              user={user}
                              updateEmail={updateEmail}
                              linkEmail={linkEmail}
                              handleLogout={handleLogout}
                              isLoggingOut={isLoggingOut}
                              onBack={() => setCurrentView("wallet")}
                            />
                          )}

                          {currentView === "transfer" && (
                            <div className="space-y-6">
                              <TransferForm
                                onClose={onClose}
                                showBackButton
                                setCurrentView={setCurrentView}
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
                              handleHistoryClose={() =>
                                setCurrentView("wallet")
                              }
                            />
                          )}
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </DialogPanel>
                </motion.div>
              </div>
            </div>
          </Dialog>
        )}
      </AnimatePresence>
    </>
  );
};
