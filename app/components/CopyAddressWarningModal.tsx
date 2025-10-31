"use client";

import { Dialog } from "@headlessui/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Copy01Icon,
  InformationSquareIcon,
  Wallet01Icon,
  WalletDone01Icon,
} from "hugeicons-react";
import { useNetwork } from "../context/NetworksContext";
import { useTokens } from "../context";
import { networks } from "../mocks";
import { useActualTheme } from "../hooks/useActualTheme";
import { useEffect, useState } from "react";
import Image from "next/image";
import { shouldUseInjectedWallet, getNetworkImageUrl } from "../utils";
import { toast } from "sonner";
import { trackEvent } from "../hooks/analytics/useMixpanel";
import { PiCheck } from "react-icons/pi";
import { slideUpAnimation } from "./AnimatedComponents";
import { Token } from "../types";
import { useSearchParams } from "next/navigation";

interface CopyAddressWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  address: string;
}

export const CopyAddressWarningModal: React.FC<
  CopyAddressWarningModalProps
> = ({ isOpen, onClose, address }) => {
  const { selectedNetwork } = useNetwork();
  const searchParams = useSearchParams();
  const useInjectedWallet = shouldUseInjectedWallet(searchParams);
  const { allTokens } = useTokens();
  const isDark = useActualTheme();
  const [isAddressCopied, setIsAddressCopied] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Filter networks based on wallet type (same logic as NetworksDropdown):
  // - If isInjectedWallet is true: show all networks (including Celo and Hedera Mainnet)
  // - If isInjectedWallet is false: filter out Celo and Hedera Mainnet (smart wallet only)
  const supportedNetworks = networks.filter((network) => {
    if (useInjectedWallet) return true;
    return network.chain.name !== "Celo" && network.chain.name !== "Hedera Mainnet";
  });

  // Check localStorage on mount to see if user has opted out
  useEffect(() => {
    const preference = localStorage.getItem("hideAddressWarningModal");
    if (preference === "true" && isOpen) {
      onClose();
    }
  }, [isOpen, onClose]);

  const fundTokens = allTokens[selectedNetwork.chain.name] || [];
  const fundTokenOptions = fundTokens.map((token: Token) => ({
    name: token.symbol,
    imageUrl: token.imageUrl,
  }));

  // Track modal view when opened
  useEffect(() => {
    if (isOpen && selectedNetwork) {
      trackEvent("copy_address_modal_viewed", {
        network: selectedNetwork.chain.name,
        chain_id: selectedNetwork.chain.id,
      });
    }
  }, [isOpen, selectedNetwork]);

  const handleAcknowledge = () => {
    if (isOpen && selectedNetwork) {
      trackEvent("copy_address_modal_acknowledged", {
        network: selectedNetwork.chain.name,
        chain_id: selectedNetwork.chain.id,
        dont_show_again: dontShowAgain,
      });
    }
    
    // Save preference to localStorage if checkbox is checked
    if (dontShowAgain) {
      localStorage.setItem("hideAddressWarningModal", "true");
    }
    
    onClose();
  };

  useEffect(() => {
    if (isOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          onClose();
        }
      };
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, onClose]);

  // Copy wallet address to clipboard with feedback
  const handleCopyAddress = () => {
    navigator.clipboard.writeText(address ?? "");
    setIsAddressCopied(true);
    setTimeout(() => setIsAddressCopied(false), 2000);
    toast.success("Address copied to clipboard");
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog
          as="div"
          open={isOpen}
          onClose={onClose}
          className="fixed inset-0 z-[80] overflow-hidden"
          role="dialog"
        >
          <div className="flex h-full items-center justify-center">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/25 backdrop-blur-sm dark:bg-black/40"
              onClick={onClose}
            />

            {/* Desktop Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative z-50 hidden h-fit min-h-[530px] w-full max-w-[412px] rounded-[20px] bg-white p-5 dark:bg-surface-overlay sm:block"
            >
              {/* Header with warning icon */}
              <div className="mb-4 flex flex-col items-start gap-4">
                <WalletDone01Icon
                  size={28}
                  className="text-text-secondary dark:text-white/50"
                />
                <div className="flex-1">
                  <Dialog.Title
                    className="mb-2 text-lg font-semibold text-text-body dark:text-white"
                  >
                    You just copied your wallet address!
                  </Dialog.Title>
                  <Dialog.Description
                    className="max-w-[95%] text-sm font-normal text-text-body dark:text-white/70"
                  >
                    Only deposit <span className="font-semibold">supported stablecoins</span> on <span className="font-semibold">supported networks</span>. Depositing unsupported tokens or using unsupported networks may result in loss of funds.
                  </Dialog.Description>
                </div>
              </div>

              {/* copied address */}
              <div className="relative mb-2 flex h-fit min-h-[80px] w-full flex-col items-start gap-3 rounded-2xl border border-border-light bg-white px-3 py-3 dark:border-white/10 dark:bg-surface-canvas">
                <div className="relative mt-0 flex w-full items-start justify-between gap-4">
                  <p className="w-[80%] text-wrap break-all text-lg font-medium text-black dark:text-white/70">
                    {address || "No address available"}
                  </p>
                  {isAddressCopied ? (
                    <PiCheck
                      size={24}
                      className="absolute bottom-2 right-2 text-green-900 dark:text-green-500"
                    />
                  ) : (
                    <Copy01Icon
                      onClick={handleCopyAddress}
                      size={24}
                      className="absolute bottom-2 right-2 cursor-pointer text-icon-outline-secondary transition-all group-hover:text-lavender-500 dark:text-white/50 dark:hover:text-white"
                      strokeWidth={2}
                    />
                  )}
                </div>
              </div>

              {/* Supported networks list */}
              <div className="relative mb-2 flex h-fit w-full flex-col items-start gap-2 rounded-2xl border border-border-light bg-transparent px-3 py-3 dark:border-white/5">
                <h4 className="mb-1 text-xs font-light text-text-secondary dark:text-white/50">
                  Supported stablecoins
                </h4>
                <div className="flex h-full w-full flex-wrap gap-2 mb-2">
                  {fundTokenOptions.map((token) => (
                    <div
                      key={`${selectedNetwork.chain.id}-${token.name}`}
                      className="flex h-[24px] w-fit items-center gap-0.5 rounded-full bg-accent-gray p-2 dark:bg-white/10"
                    >
                      <div className="h-[16px] w-[16px]">
                        <Image
                          src={token.imageUrl!}
                          alt={`${token.name} logo`}
                          width={24}
                          height={24}
                          className="h-full w-full rounded-full object-contain"
                        />
                      </div>
                      <span className="text-xs font-medium text-text-body dark:text-white/80">
                        {token.name}
                      </span>
                    </div>
                  ))}
                </div>
                <h4 className="mb-1 text-xs font-light text-text-secondary dark:text-white/50">
                  Supported networks
                </h4>
                <div className="flex h-full w-full flex-wrap gap-2">
                  {supportedNetworks.map((network) => (
                    <div
                      key={network.chain.id}
                      className="flex h-[24px] w-fit items-center gap-0.5 rounded-full bg-accent-gray p-2 dark:bg-white/10"
                    >
                      <div className="h-[16px] w-[16px]">
                        <Image
                          src={getNetworkImageUrl(network, isDark)}
                          alt={`${network.chain.name} logo`}
                          width={24}
                          height={24}
                          className="h-full w-full rounded-full object-contain"
                        />
                      </div>
                      <span className="text-xs font-medium text-text-body dark:text-white/80">
                        {network.chain.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Warning note */}
              <div className="mb-4 flex h-[48px] w-full items-start gap-0.5 rounded-xl bg-warning-background/[36%] px-3 py-2 dark:bg-warning-background/[8%]">
                <InformationSquareIcon className="mr-2 h-[24px] w-[24px] text-warning-foreground dark:text-warning-text" />
                <p className="text-xs font-light leading-tight text-warning-foreground dark:text-warning-text">
                  Use only supported stablecoins & networks. Unsupported ones may lead to loss of funds.
                </p>
              </div>

              {/* Action button */}
              <div className="flex gap-4 items-center justify-between">
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="acknowledge" 
                    checked={dontShowAgain}
                    onChange={(e) => {
                      setDontShowAgain(e.target.checked);
                    }}
                    className="cursor-pointer rounded-xl w-[19px] h-[19px] border-[2px] dark:border-white/30 accent-lavender-500"
                  />
                  <label htmlFor="acknowledge" className="text-xs text-normal text-text-body dark:text-white/70 cursor-pointer select-none">Don&apos;t show this to me again</label>
                </div>
                <button
                onClick={handleAcknowledge}
                className="w-[169px] rounded-xl bg-lavender-500 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-lavender-600 focus:outline-none cursor-pointer"
              >
                Got it
              </button>
              </div>
            </motion.div>

            {/* Mobile Modal */}
            <motion.div 
              {...slideUpAnimation} 
              className="fixed inset-x-0 bottom-0 z-50 w-full sm:hidden"
            >
              <div className="scrollbar-hide relative max-h-[90vh] w-full overflow-visible rounded-t-[20px] border border-border-light bg-white px-5 pt-6 shadow-xl dark:border-white/5 dark:bg-surface-overlay">
                  <div className="scrollbar-hide max-h-[90vh] overflow-y-scroll pb-12">
                    {/* Header with warning icon */}
                    <div className="mb-4 flex flex-col items-start gap-4">
                      <WalletDone01Icon
                        size={28}
                        className="text-text-secondary dark:text-white/50"
                      />
                      <div className="flex-1">
                        <Dialog.Title
                          className="mb-2 text-lg font-semibold text-text-body dark:text-white"
                        >
                          You just copied your wallet address!
                        </Dialog.Title>
                        <Dialog.Description
                          className="max-w-[95%] text-sm font-normal text-text-body dark:text-white/70"
                        >
                          Only deposit <span className="font-semibold">supported stablecoins</span> on <span className="font-semibold">supported networks</span>. Depositing unsupported tokens or using unsupported networks may result in loss of funds.
                        </Dialog.Description>
                      </div>
                    </div>

                    {/* copied address */}
                    <div className="relative mb-2 flex h-fit min-h-[80px] w-full flex-col items-start gap-3 rounded-2xl border border-border-light bg-white px-3 py-3 dark:border-white/10 dark:bg-surface-canvas">
                      <div className="group relative mt-0 flex w-full items-start justify-between gap-4">
                        <p className="w-[80%] text-wrap break-all text-lg font-medium text-black dark:text-white/70">
                          {address || "No address available"}
                        </p>
                        {isAddressCopied ? (
                          <PiCheck
                            size={24}
                            className="absolute bottom-2 right-2 text-green-900 dark:text-green-500"
                          />
                        ) : (
                          <Copy01Icon
                            onClick={handleCopyAddress}
                            size={24}
                            className="absolute bottom-2 right-2 cursor-pointer text-icon-outline-secondary transition-all group-hover:text-lavender-500 dark:text-white/50 dark:hover:text-white"
                            strokeWidth={2}
                          />
                        )}
                      </div>
                    </div>

                    {/* Supported networks list */}
                    <div className="relative mb-2 flex h-fit w-full flex-col items-start gap-2 rounded-2xl border border-border-light bg-transparent px-3 py-3 dark:border-white/5">
                      <h4 className="mb-1 text-xs font-light text-text-secondary dark:text-white/50">
                        Supported stablecoins
                      </h4>
                      <div className="flex h-full w-full flex-wrap gap-2 mb-2">
                        {fundTokenOptions.map((token) => (
                          <div
                            key={`${selectedNetwork.chain.id}-${token.name}`}
                            className="flex h-[24px] w-fit items-center gap-0.5 rounded-full bg-accent-gray p-2 dark:bg-white/10"
                          >
                            <div className="h-[16px] w-[16px]">
                              <Image
                                src={token.imageUrl!}
                                alt={`${token.name} logo`}
                                width={24}
                                height={24}
                                className="h-full w-full rounded-full object-contain"
                              />
                            </div>
                            <span className="text-xs font-medium text-text-body dark:text-white/80">
                              {token.name}
                            </span>
                          </div>
                        ))}
                      </div>

                      <h4 className="mb-1 text-xs font-light text-text-secondary dark:text-white/50">
                        Supported networks
                      </h4>
                      <div className="flex h-full w-full flex-wrap gap-2">
                        {supportedNetworks.map((network) => (
                          <div
                            key={network.chain.id}
                            className="flex h-[24px] w-fit items-center gap-0.5 rounded-full bg-accent-gray p-2 dark:bg-white/10"
                          >
                            <div className="h-[16px] w-[16px]">
                              <Image
                                src={getNetworkImageUrl(network, isDark)}
                                alt={`${network.chain.name} logo`}
                                width={24}
                                height={24}
                                className="h-full w-full rounded-full object-contain"
                              />
                            </div>
                            <span className="text-xs font-medium text-text-body dark:text-white/80">
                              {network.chain.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Warning note */}
                    <div className="mb-4 flex h-[48px] w-full items-start gap-0.5 rounded-xl bg-warning-background/[36%] px-3 py-2 dark:bg-warning-background/[8%]">
                      <InformationSquareIcon className="mr-2 h-[24px] w-[24px] text-warning-foreground dark:text-warning-text" />
                      <p className="text-xs font-light leading-tight text-warning-foreground dark:text-warning-text">
                        Use only supported stablecoins & networks. Unsupported ones may lead to loss of funds.
                      </p>
                    </div>

                    {/* Action button */}
                    <div className="flex gap-4 items-center justify-between">
                      <div className="flex items-center gap-2">
                        <input 
                          type="checkbox" 
                          id="acknowledge-mobile" 
                          checked={dontShowAgain}
                          onChange={(e) => {
                            setDontShowAgain(e.target.checked);
                          }}
                          className="cursor-pointer rounded-3xl w-[19px] h-[19px] border-[2px] dark:border-white/30 accent-lavender-500"
                        />
                        <label htmlFor="acknowledge-mobile" className="text-xs text-normal text-text-body dark:text-white/70 cursor-pointer select-none">Don&apos;t show this to me again</label>
                      </div>
                      <button
                        onClick={handleAcknowledge}
                        className="w-[169px] rounded-xl bg-lavender-500 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-lavender-600 focus:outline-none cursor-pointer"
                      >
                        Got it
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </Dialog>
        )}
      </AnimatePresence>
    );
};
