"use client";
import { DialogTitle } from "@headlessui/react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { useState, useEffect } from "react";
import { PiCheck } from "react-icons/pi";
import { HelpCircleIcon, ArrowLeft02Icon, Cancel01Icon } from "hugeicons-react";
import { usePrivy } from "@privy-io/react-auth";
import { networks } from "../mocks";
import { useNetwork } from "../context/NetworksContext";
import { AnimatedModal } from "./AnimatedComponents";
import {
  shouldUseInjectedWallet,
  handleNetworkSwitch,
  getNetworkImageUrl,
} from "../utils";
import { useSearchParams } from "next/navigation";
import { useActualTheme } from "../hooks/useActualTheme";

export const NetworkSelectionModal = () => {
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [hasCheckedStorage, setHasCheckedStorage] = useState(false);
  const { selectedNetwork, setSelectedNetwork } = useNetwork();
  const { authenticated, user } = usePrivy();
  const useInjectedWallet = shouldUseInjectedWallet(searchParams);
  const isDark = useActualTheme();

  useEffect(() => {
    if (!hasCheckedStorage && authenticated && user?.wallet?.address) {
      const storageKey = `hasSeenNetworkModal-${user.wallet.address}`;
      const hasSeenModal = localStorage.getItem(storageKey);

      if (!hasSeenModal) {
        setIsOpen(true);
      }
      setHasCheckedStorage(true);
    }
  }, [hasCheckedStorage, authenticated, user?.wallet?.address]);

  const handleClose = () => {
    if (user?.wallet?.address) {
      const storageKey = `hasSeenNetworkModal-${user.wallet.address}`;
      localStorage.setItem(storageKey, "true");
    }
    setIsOpen(false);
  };

  const handleNetworkSelect = async (networkName: string) => {
    const newNetwork = networks.find((net) => net.chain.name === networkName);
    if (newNetwork) {
      handleNetworkSwitch(
        newNetwork,
        useInjectedWallet,
        setSelectedNetwork,
        handleClose,
        (error) => {
          console.error("Failed to switch network:", error);
          setSelectedNetwork(selectedNetwork);
        },
      );
    }
  };

  if (!authenticated) return null;

  return (
    <AnimatedModal isOpen={isOpen} onClose={handleClose} maxWidth="28.5rem">
      <motion.div
        layout
        layoutRoot
        transition={{ duration: 0.2, type: "spring" }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {!showInfo ? (
            <motion.div
              key="networks"
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, type: "spring" }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <DialogTitle className="text-center text-lg font-semibold text-text-body dark:text-white">
                  Choose network
                </DialogTitle>
                <button
                  type="button"
                  title="Close"
                  onClick={handleClose}
                  className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10"
                >
                  <Cancel01Icon className="size-5 text-outline-gray dark:text-white/50" />
                </button>
              </div>

              <p className="text-sm text-text-secondary dark:text-white/50">
                You can change this later in your settings
              </p>

              <div className="space-y-2">
                {networks
                  .filter((network) => {
                    if (useInjectedWallet) return true;
                    return network.chain.name !== "Celo" && network.chain.name !== "Hedera Mainnet";
                  })
                  .map((network) => (
                    <button
                      key={network.chain.name}
                      type="button"
                      aria-label={`Select ${network.chain.name} network`}
                      onClick={() => handleNetworkSelect(network.chain.name)}
                      className="flex w-full items-center justify-between rounded-xl p-3 max-sm:bg-background-neutral max-sm:dark:bg-white/5 sm:hover:bg-background-neutral sm:dark:hover:bg-white/5"
                    >
                      <div className="flex items-center gap-3">
                        <Image
                          src={getNetworkImageUrl(network, isDark)}
                          alt={network.chain.name}
                          width={24}
                          height={24}
                          className="size-6"
                        />
                        <span className="text-text-body dark:text-white/80">
                          {network.chain.name}
                        </span>
                      </div>
                      {selectedNetwork.chain.name === network.chain.name && (
                        <PiCheck className="size-5 text-green-900 dark:text-green-500" />
                      )}
                    </button>
                  ))}
              </div>

              <button
                type="button"
                aria-label="Learn about networks"
                onClick={() => setShowInfo(true)}
                className="mx-auto flex items-center gap-2 text-sm font-medium text-lavender-500"
              >
                <span>What is a network?</span>
                <HelpCircleIcon className="size-4" strokeWidth={2} />
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="info"
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div className="mb-6 flex items-center justify-between">
                <button
                  type="button"
                  aria-label="Back to network selection"
                  onClick={() => setShowInfo(false)}
                  className="-ml-2 rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10"
                >
                  <ArrowLeft02Icon className="size-5 text-outline-gray dark:text-white/50" />
                </button>
                <h2 className="text-center text-lg font-semibold text-text-body dark:text-white">
                  What is a network?
                </h2>
                <div className="w-10" />
              </div>

              <p className="text-sm text-text-secondary dark:text-white/50">
                Networks are secure digital platforms that process and verify
                your transactions using many computers working together.
              </p>

              <button
                type="button"
                aria-label="Return to network selection"
                onClick={() => setShowInfo(false)}
                className="min-h-11 w-full rounded-xl bg-accent-gray py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-accent-gray/90 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              >
                Done
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatedModal>
  );
};
