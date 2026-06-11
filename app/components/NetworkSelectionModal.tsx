"use client";
import { DialogTitle } from "@headlessui/react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { PiCheck } from "react-icons/pi";
import { HelpCircleIcon, ArrowLeft02Icon, Cancel01Icon } from "hugeicons-react";
import { usePrivy } from "@privy-io/react-auth";
import { networks } from "../mocks";
import { useNetwork } from "../context/NetworksContext";
import { useStarknet } from "../context";
import { AnimatedModal } from "./AnimatedComponents";
import {
  shouldUseInjectedWallet,
  handleNetworkSwitch,
  getNetworkImageUrl,
} from "../utils";
import { useSearchParams } from "next/navigation";
import { useActualTheme } from "../hooks/useActualTheme";
import {
  hasSeenNetworkModalFlag,
  markNetworkModalSeen,
  markNetworkModalDismissed,
} from "../lib/networkModalStore";

interface NetworkSelectionModalProps {
  onNetworkSelected?: () => void;
}

// export const NetworkSelectionModal = () => {
export const NetworkSelectionModal = ({
  onNetworkSelected,
}: NetworkSelectionModalProps = {}) => {
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  // Wallet-scoped sentinel: a plain boolean stayed sticky across logout/login
  // or wallet switches, so the modal never re-evaluated for the next account.
  const checkedWalletRef = useRef<string | null>(null);
  const { selectedNetwork, setSelectedNetwork } = useNetwork();
  const { ensureWalletExists } = useStarknet();
  const { authenticated, user, ready } = usePrivy();
  const useInjectedWallet = shouldUseInjectedWallet(searchParams);
  const isDark = useActualTheme();

  // Wait for Privy to finish hydrating before deciding whether to open. On a
  // fresh signup the embedded wallet address arrives a tick after `authenticated`
  // flips true; gating on `ready` (and re-running when the address settles)
  // avoids the case where the modal evaluated too early and never opened until a
  // manual refresh — which also blocked the referral modal that chains off it.
  useEffect(() => {
    if (!ready || !authenticated) return;

    // Pass the RAW address to hasSeenNetworkModalFlag: it checks the canonical
    // lowercased key AND the legacy checksummed key. Lowercasing here first
    // defeated the legacy lookup and re-opened the modal on login for every
    // pre-existing account. Only the sentinel comparison is case-normalized.
    const rawAddress = user?.wallet?.address;
    if (!rawAddress) return; // wait for the address; effect re-runs when it lands
    const sentinel = rawAddress.toLowerCase();
    if (checkedWalletRef.current === sentinel) return;

    if (!hasSeenNetworkModalFlag(rawAddress)) {
      setIsOpen(true);
    }
    checkedWalletRef.current = sentinel;
  }, [ready, authenticated, user?.wallet?.address]);

  // const handleClose = () => {
  //   if (user?.wallet?.address) {
  //     const storageKey = `hasSeenNetworkModal-${user.wallet.address}`;
  //     localStorage.setItem(storageKey, "true");
  //   }
  //   setIsOpen(false);
  // };

  const handleClose = () => {
    markNetworkModalSeen(user?.wallet?.address);
    // Live in-session signal for MigrationBannerWrapper — this call was never
    // wired up, so migration UI gated on it could only appear after a reload
    // (and the storage fallback's key casing didn't match either).
    markNetworkModalDismissed();
    setIsOpen(false);

    // Trigger callback when modal closes after network selection
    if (onNetworkSelected) {
      // Small delay to ensure smooth transition
      setTimeout(() => {
        onNetworkSelected();
      }, 300);
    }
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
        ensureWalletExists, // Pass the Starknet wallet creation function
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
                {networks.map((network) => (
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
