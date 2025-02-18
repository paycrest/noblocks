"use client";
import Image from "next/image";
import { Dialog, DialogPanel } from "@headlessui/react";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { usePrivy, useFundWallet } from "@privy-io/react-auth";
import {
  Cancel01Icon,
  ArrowRight01Icon,
  Mail01Icon,
  ColorsIcon,
  Logout03Icon,
  AccessIcon,
  Setting07Icon,
  Wallet01Icon,
  HelpCircleIcon,
  ArrowLeft02Icon,
  ArrowDown01Icon,
} from "hugeicons-react";

import { useNetwork } from "../context/NetworksContext";
import { useBalance } from "../context/BalanceContext";
import { classNames, shortenAddress, fetchSupportedTokens } from "../utils";
import { trackEvent } from "../hooks/analytics";
import { useLogout } from "@privy-io/react-auth";
import { PiCheck } from "react-icons/pi";
import { ImSpinner } from "react-icons/im";
import { ThemeSwitch } from "./ThemeSwitch";
import { TransferModal } from "./TransferModal";
import { networks } from "../mocks";
import { Token } from "../types";
import { toast } from "sonner";
import { useStep } from "../context/StepContext";
import { STEPS } from "../types";

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

  const { selectedNetwork, setSelectedNetwork } = useNetwork();
  const { user, exportWallet, linkEmail, updateEmail } = usePrivy();
  const { allBalances, refreshBalance } = useBalance();
  const { logout } = useLogout({
    onSuccess: () => {
      setIsLoggingOut(false);
      onClose();
    },
  });

  const { fundWallet } = useFundWallet({
    onUserExited: ({ fundingMethod, chain }) => {
      // NOTE: This is an inaccurate way of tracking funding status
      // Privy doesn't provide detailed funding status information
      // Available variables in onUserExited: address, chain, fundingMethod, balance
      // Limitations:
      // 1. fundingMethod only indicates user selected a method, not if funding completed
      // 2. User can select method and cancel, but it still records as "completed"
      // 3. No way to track funding errors
      // 4. balance is returned as bigint and doesn't specify token type
      // 5. No webhook or callback for actual funding confirmation
      if (fundingMethod) {
        refreshBalance();
        trackEvent("Funding completed", {
          "Funding type": fundingMethod,
          Amount: "Not available on Privy",
          Network: chain.name,
          Token: "USDC", // privy only supports USDC
          "Funding date": new Date().toISOString(),
        });
      } else {
        trackEvent("Funding cancelled", {
          "Funding type": "User exited the funding process",
          Amount: "Not available on Privy",
          Network: chain.name,
          Token: "USDC", // privy only supports USDC
          "Funding date": new Date().toISOString(),
        });
      }
    },
  });

  const smartWallet = user?.linkedAccounts.find(
    (account) => account.type === "smart_wallet",
  );

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
                                Noblocks Wallet
                              </h3>
                              <HelpCircleIcon
                                className="size-4 text-gray-400 dark:text-white/30"
                                strokeWidth={2}
                              />
                            </div>

                            <div className="space-y-2">
                              {Object.entries(
                                allBalances.smartWallet?.balances || {},
                              ).map(([token, balance]) => (
                                <div
                                  key={token}
                                  className="flex items-center gap-1"
                                >
                                  <img
                                    src={getTokenImageUrl(token)}
                                    alt={token}
                                    className="size-3.5"
                                  />
                                  <span className="font-medium dark:text-white/80">
                                    {balance} {token}
                                  </span>
                                </div>
                              ))}
                            </div>

                            {/* Fund/Transfer Buttons */}
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
                                onClick={() => {
                                  fundWallet(smartWallet?.address ?? "");
                                  trackEvent("Funding started", {
                                    "Entry point": "Mobile wallet dropdown",
                                  });
                                }}
                                className="min-h-11 w-full rounded-xl bg-accent-gray py-2 text-sm font-medium text-gray-900 dark:bg-white/5 dark:text-white"
                              >
                                Fund
                              </button>
                            </div>
                          </div>

                          {/* Wallet Address Container */}
                          <div className="space-y-3 rounded-[20px] border border-border-light bg-transparent p-3 dark:border-white/10">
                            <div className="flex items-center gap-2">
                              <Wallet01Icon className="size-4 text-outline-gray dark:text-white/50" />
                              <span className="text-sm text-text-secondary dark:text-white/50">
                                Wallet Address
                              </span>
                            </div>

                            <span className="block break-words text-sm font-medium dark:text-white/80">
                              {shortenAddress(
                                smartWallet?.address ?? "",
                                14,
                                20,
                              )}
                            </span>

                            <button
                              type="button"
                              onClick={handleCopyAddress}
                              className="min-h-11 w-full rounded-xl bg-accent-gray py-2 text-sm font-medium text-gray-900 dark:bg-white/5 dark:text-white"
                            >
                              <span>Copy</span>
                            </button>
                          </div>

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
                                <HelpCircleIcon
                                  className="size-4 text-gray-400 dark:text-white/30"
                                  strokeWidth={2}
                                />
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
                                      className="size-4"
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
                                      onClick={() => {
                                        if (currentStep !== STEPS.FORM) {
                                          toast.error(
                                            "Cannot switch networks during an active transaction",
                                          );
                                          return;
                                        }
                                        setSelectedNetwork(network);
                                        setIsNetworkListOpen(false);
                                        toast("Network switched successfully", {
                                          description: `You are now connected to ${network.chain.name} network`,
                                        });
                                      }}
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
                            {user?.email ? (
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
                            ) : (
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
                            )}

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

                            <div className="flex w-full items-center justify-between">
                              <div className="flex items-center gap-3">
                                <ColorsIcon className="size-5 text-outline-gray dark:text-white/50" />
                                <span className="text-text-body dark:text-white/80">
                                  Theme
                                </span>
                              </div>
                              <ThemeSwitch />
                            </div>

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

      <AnimatePresence>
        {isTransferModalOpen && (
          <Dialog
            open={isTransferModalOpen}
            onClose={() => setIsTransferModalOpen(false)}
            className="relative z-50"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 bg-black/30 backdrop-blur-sm"
            />
            <div className="fixed inset-0 flex w-screen items-end justify-center">
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 30,
                }}
              >
                <DialogPanel className="relative max-h-[90vh] w-full overflow-y-auto rounded-t-[30px] bg-white p-5 text-sm dark:bg-surface-overlay">
                  <TransferModal
                    setIsTransferModalOpen={setIsTransferModalOpen}
                  />
                </DialogPanel>
              </motion.div>
            </div>
          </Dialog>
        )}
      </AnimatePresence>
    </>
  );
};
