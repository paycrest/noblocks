"use client";
import Image from "next/image";
import { Dialog, DialogPanel } from "@headlessui/react";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  Cancel01Icon,
  ArrowRight01Icon,
  Mail01Icon,
  ColorsIcon,
  Logout03Icon,
  AccessIcon,
  Setting07Icon,
  Wallet01Icon,
  ArrowLeft02Icon,
  ArrowDown01Icon,
  CustomerService01Icon,
} from "hugeicons-react";

import { useNetwork } from "../context/NetworksContext";
import { useBalance } from "../context/BalanceContext";
import {
  classNames,
  shortenAddress,
  fetchSupportedTokens,
  handleNetworkSwitch,
  detectWalletProvider,
} from "../utils";
import { useLogout } from "@privy-io/react-auth";
import { PiCheck } from "react-icons/pi";
import { ImSpinner } from "react-icons/im";
import { ThemeSwitch } from "./ThemeSwitch";
import { TransferModal } from "./TransferModal";
import { networks } from "../mocks";
import { Network, Token } from "../types";
import { toast } from "sonner";
import { useStep } from "../context/StepContext";
import { STEPS } from "../types";
import { FundWalletModal } from "./FundWalletModal";
import { useFundWalletHandler } from "../hooks/useFundWalletHandler";
import config from "@/app/lib/config";
import { useInjectedWallet } from "../context";

type View = "wallet" | "settings";

export const MobileDropdown = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  const [currentView, setCurrentView] = useState<View>("wallet");
  const [isNetworkListOpen, setIsNetworkListOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isFundModalOpen, setIsFundModalOpen] = useState(false);

  const { selectedNetwork, setSelectedNetwork } = useNetwork();
  const { user, exportWallet, linkEmail, updateEmail } = usePrivy();
  const { allBalances } = useBalance();
  const { logout } = useLogout({
    onSuccess: () => {
      setIsLoggingOut(false);
      onClose();
    },
  });
  const { isInjectedWallet, injectedAddress } = useInjectedWallet();

  const { handleFundWallet } = useFundWalletHandler("Mobile menu");

  const smartWallet = isInjectedWallet
    ? { address: injectedAddress }
    : user?.linkedAccounts.find((account) => account.type === "smart_wallet");

  const { currentStep } = useStep();

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(smartWallet?.address ?? "");
    toast.success("Address copied to clipboard");
  };

  const tokens: { name: string; imageUrl: string | undefined }[] = [];
  const fetchedTokens: Token[] =
    fetchSupportedTokens(selectedNetwork.chain.name) || [];
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

  const slideUpAnimation = {
    initial: { y: "100%", opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: "100%", opacity: 0 },
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 30,
      duration: 0.2,
    },
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

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <Dialog
            open={isOpen}
            onClose={onClose}
            className="relative z-50 sm:hidden"
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
                  <DialogPanel className="relative w-full overflow-visible rounded-t-[30px] border border-border-light bg-white px-5 pb-12 pt-6 shadow-xl *:text-sm dark:border-white/5 dark:bg-surface-overlay">
                    <AnimatePresence mode="wait">
                      {currentView === "wallet" && (
                        <motion.div
                          key="wallet"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="space-y-4"
                        >
                          <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-text-body dark:text-white">
                              Wallet
                            </h2>
                            <div className="flex items-center">
                              <button
                                type="button"
                                title="Settings"
                                onClick={() => setCurrentView("settings")}
                                className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10"
                              >
                                <Setting07Icon className="size-5 text-outline-gray dark:text-white/50" />
                              </button>
                              <button
                                type="button"
                                title="Close"
                                onClick={onClose}
                                className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10"
                              >
                                <Cancel01Icon className="size-5 text-outline-gray dark:text-white/50" />
                              </button>
                            </div>
                          </div>

                          {/* Smart Wallet Container */}
                          <div className="space-y-3 rounded-[20px] border border-border-light bg-transparent p-3 dark:border-white/10">
                            <div className="flex items-center gap-1">
                              <h3 className="font-light text-text-secondary dark:text-white/50">
                                {isInjectedWallet
                                  ? detectWalletProvider()
                                  : "Noblocks Wallet"}
                              </h3>
                            </div>

                            <div className="space-y-2">
                              {Object.entries(
                                activeBalance?.balances || {},
                              ).map(([token, balance]) => (
                                <div
                                  key={token}
                                  className="flex items-center gap-1"
                                >
                                  {(() => {
                                    const imageUrl = getTokenImageUrl(token);
                                    return imageUrl ? (
                                      <Image
                                        src={imageUrl}
                                        alt={token}
                                        width={14}
                                        height={14}
                                        className="size-3.5"
                                      />
                                    ) : null;
                                  })()}

                                  <span className="font-medium dark:text-white/80">
                                    {balance} {token}
                                  </span>
                                </div>
                              ))}
                            </div>

                            {!isInjectedWallet && (
                              <div className="grid grid-cols-2 gap-4">
                                <button
                                  type="button"
                                  onClick={() => setIsTransferModalOpen(true)}
                                  className="min-h-11 w-full rounded-xl bg-accent-gray py-2 text-sm font-medium text-gray-900 dark:bg-white/5 dark:text-white"
                                >
                                  Transfer
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setIsFundModalOpen(true)}
                                  className="min-h-11 w-full rounded-xl bg-accent-gray py-2 text-sm font-medium text-gray-900 dark:bg-white/5 dark:text-white"
                                >
                                  Fund
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Wallet Address Container */}
                          {smartWallet?.address && (
                            <div className="space-y-3 rounded-[20px] border border-border-light bg-transparent p-3 dark:border-white/10">
                              <div className="flex items-center gap-2">
                                <Wallet01Icon className="size-4 text-outline-gray dark:text-white/50" />
                                <span className="text-sm text-text-secondary dark:text-white/50">
                                  Wallet Address
                                </span>
                              </div>

                              <span className="block break-words text-sm font-medium dark:text-white/80">
                                {smartWallet?.address ?? ""}
                              </span>

                              <button
                                type="button"
                                onClick={handleCopyAddress}
                                className="min-h-11 w-full rounded-xl bg-accent-gray py-2 text-sm font-medium text-gray-900 dark:bg-white/5 dark:text-white"
                              >
                                <span>Copy</span>
                              </button>
                            </div>
                          )}

                          <div
                            className={classNames(
                              "space-y-3 rounded-[20px] py-3",
                              isNetworkListOpen
                                ? "border border-border-light px-4 dark:border-white/10"
                                : "",
                            )}
                          >
                            <div
                              className="flex cursor-pointer items-center justify-between"
                              onClick={() =>
                                setIsNetworkListOpen(!isNetworkListOpen)
                              }
                            >
                              <div
                                className={classNames(
                                  "flex items-center",
                                  isNetworkListOpen ? "gap-3" : "gap-1",
                                )}
                              >
                                <AnimatePresence mode="wait">
                                  <motion.span
                                    key={
                                      isNetworkListOpen ? "select" : "network"
                                    }
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className={classNames(
                                      "font-medium text-text-body",
                                      isNetworkListOpen
                                        ? "text-base dark:text-white"
                                        : "dark:text-white/80",
                                    )}
                                  >
                                    {isNetworkListOpen
                                      ? "Select network"
                                      : "Network"}
                                  </motion.span>
                                </AnimatePresence>
                              </div>
                              <AnimatePresence mode="wait">
                                {!isNetworkListOpen && (
                                  <motion.div
                                    initial={{ x: -10, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: -10, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="flex items-center gap-2"
                                  >
                                    <Image
                                      src={selectedNetwork.imageUrl}
                                      alt={selectedNetwork.chain.name}
                                      width={16}
                                      height={16}
                                      className="size-4 rounded-full"
                                    />
                                    <span className="text-text-body dark:text-white">
                                      {selectedNetwork.chain.name}
                                    </span>
                                    <ArrowDown01Icon className="size-4 text-outline-gray transition-transform dark:text-white/50" />
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>

                            <AnimatePresence>
                              {isNetworkListOpen && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="space-y-2 overflow-hidden *:min-h-11"
                                >
                                  {networks.map((network) => (
                                    <button
                                      type="button"
                                      key={network.chain.name}
                                      onClick={() =>
                                        handleNetworkSwitchWrapper(network)
                                      }
                                      className="flex w-full items-center justify-between"
                                    >
                                      <div className="flex items-center gap-2 py-2.5">
                                        <Image
                                          src={network.imageUrl}
                                          alt={network.chain.name}
                                          width={24}
                                          height={24}
                                          className="size-6"
                                        />
                                        <span className="text-text-body dark:text-white/80">
                                          {network.chain.name}
                                        </span>
                                      </div>
                                      {selectedNetwork.chain.name ===
                                        network.chain.name && (
                                        <PiCheck
                                          className="size-5 text-green-900 dark:text-green-500"
                                          strokeWidth={2}
                                        />
                                      )}
                                    </button>
                                  ))}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </motion.div>
                      )}

                      {currentView === "settings" && (
                        <motion.div
                          key="settings"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="space-y-6"
                        >
                          <div className="flex items-center justify-between">
                            <button
                              type="button"
                              title="Back"
                              onClick={() => setCurrentView("wallet")}
                            >
                              <ArrowLeft02Icon className="size-5 text-outline-gray dark:text-white/50" />
                            </button>
                            <h2 className="text-lg font-semibold text-text-body dark:text-white">
                              Settings
                            </h2>
                            <div className="w-10"></div>
                          </div>

                          <div className="space-y-2 *:min-h-11">
                            {!isInjectedWallet && user?.email ? (
                              <button
                                type="button"
                                onClick={updateEmail}
                                className="flex w-full items-center justify-between"
                              >
                                <div className="flex items-center gap-3">
                                  <Mail01Icon className="size-5 text-outline-gray dark:text-white/50" />
                                  <span className="text-text-body dark:text-white/80">
                                    Linked email
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="max-w-36 truncate text-text-disabled dark:text-white/30">
                                    {user.email.address}
                                  </span>
                                  <ArrowRight01Icon className="size-4 text-outline-gray dark:text-white/50" />
                                </div>
                              </button>
                            ) : !isInjectedWallet ? (
                              <button
                                type="button"
                                onClick={linkEmail}
                                className="flex w-full items-center justify-between"
                              >
                                <div className="flex items-center gap-3">
                                  <Mail01Icon className="size-5 text-outline-gray dark:text-white/50" />
                                  <span className="text-text-body dark:text-white/80">
                                    Link email address
                                  </span>
                                </div>
                                <ArrowRight01Icon className="size-4 text-outline-gray dark:text-white/50" />
                              </button>
                            ) : null}

                            {!isInjectedWallet && (
                              <button
                                type="button"
                                onClick={exportWallet}
                                className="flex w-full items-center justify-between"
                              >
                                <div className="flex items-center gap-3">
                                  <AccessIcon className="size-5 text-outline-gray dark:text-white/50" />
                                  <span className="text-text-body dark:text-white/80">
                                    Export wallet
                                  </span>
                                </div>
                                <ArrowRight01Icon className="size-4 text-outline-gray dark:text-white/50" />
                              </button>
                            )}

                            <a
                              href={config.contactSupportUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex w-full items-center justify-between"
                            >
                              <div className="flex items-center gap-3">
                                <CustomerService01Icon className="size-5 text-outline-gray dark:text-white/50" />
                                <span className="text-text-body dark:text-white/80">
                                  Contact support
                                </span>
                              </div>
                              <ArrowRight01Icon className="size-4 text-outline-gray dark:text-white/50" />
                            </a>

                            <div className="flex w-full items-center justify-between">
                              <div className="flex items-center gap-3">
                                <ColorsIcon className="size-5 text-outline-gray dark:text-white/50" />
                                <span className="text-text-body dark:text-white/80">
                                  Theme
                                </span>
                              </div>
                              <ThemeSwitch />
                            </div>

                            {!isInjectedWallet && (
                              <button
                                type="button"
                                onClick={() => {
                                  setIsLoggingOut(true);
                                  logout();
                                }}
                                className="flex w-full items-center justify-between"
                              >
                                <div className="flex items-center gap-3">
                                  <Logout03Icon className="size-5 text-outline-gray dark:text-white/50" />
                                  <span className="text-text-body dark:text-white/80">
                                    Sign out
                                  </span>
                                </div>
                                {isLoggingOut && (
                                  <ImSpinner className="size-4 animate-spin text-outline-gray" />
                                )}
                              </button>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </DialogPanel>
                </motion.div>
              </div>
            </div>
          </Dialog>
        )}
      </AnimatePresence>

      <TransferModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
      />

      <FundWalletModal
        isOpen={isFundModalOpen}
        onClose={() => setIsFundModalOpen(false)}
        onFund={handleFundWalletClick}
      />
    </>
  );
};
