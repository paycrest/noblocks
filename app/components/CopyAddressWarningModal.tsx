"use client";

import { Dialog, DialogPanel } from "@headlessui/react";
import { AnimatePresence, motion } from "framer-motion";
import { Copy01Icon, InformationSquareIcon, Wallet01Icon, WalletDone01Icon } from "hugeicons-react";
import { useNetwork } from "../context/NetworksContext";
import { networks } from "../mocks";
import { useActualTheme } from "../hooks/useActualTheme";
import { useEffect, useState } from "react";
import Image from "next/image";
import { getNetworkImageUrl } from "../utils";
import { toast } from "sonner";
import { trackEvent } from "../hooks/analytics/useMixpanel";
import { PiCheck } from "react-icons/pi";
import { slideUpAnimation } from "./AnimatedComponents";

interface CopyAddressWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  address: string;
}

export const CopyAddressWarningModal: React.FC<CopyAddressWarningModalProps> = ({
  isOpen,
  onClose,
  address,
}) => {
  const { selectedNetwork } = useNetwork();
  const isDark = useActualTheme();
  const [isAddressCopied, setIsAddressCopied] = useState(false);

  // Track modal view when opened
  useEffect(() => {
    if (isOpen && selectedNetwork) {
      trackEvent("copy_address_modal_viewed", {
        network: selectedNetwork.chain.name,
        chain_id: selectedNetwork.chain.id,
      });
    }
  }, [isOpen, selectedNetwork, trackEvent]);

  const handleAcknowledge = () => {
    if (isOpen && selectedNetwork) {
      trackEvent("copy_address_modal_acknowledged", {
        network: selectedNetwork.chain.name,
        chain_id: selectedNetwork.chain.id,
      });
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
  }, [isOpen]);

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
          open={isOpen}
          onClose={onClose}
          className="relative z-[80]"
          role="dialog"
          aria-labelledby="copy-address-warning-title"
          aria-describedby="copy-address-warning-description"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/25 dark:bg-black/40 backdrop-blur-sm"
          />

          {/* Desktop Modal */}
          <div className="hidden sm:flex fixed inset-0 items-center justify-center p-4">
            <DialogPanel
              as={motion.div}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-[412px] min-h-[530px] h-fit bg-white dark:bg-surface-overlay p-5 rounded-[20px]"
            >
              {/* Header with warning icon */}
              <div className="flex flex-col items-start gap-4 mb-4">
                <WalletDone01Icon
                  size={28}
                  className="text-text-secondary dark:text-white/50"
                />
                <div className="flex-1">
                  <h3
                    id="copy-address-warning-title"
                    className="text-lg font-semibold text-text-body dark:text-white mb-2"
                  >
                    You just copied your wallet address!
                  </h3>
                  <p
                    id="copy-address-warning-description"
                    className="text-sm font-normal text-text-body dark:text-white/70 max-w-[85%]"
                  >
                    If you are depositing funds to it, ensure you are depositing on only the supported networks
                  </p>
                </div>
              </div>

              {/* copied address */}
              <div className="flex flex-col items-start mb-2 rounded-xl bg-white dark:bg-surface-canvas min-h-[110px] h-fit gap-3 px-3 py-3 relative w-full border border-border-light dark:border-white/10">
                <Wallet01Icon className="text-text-secondary dark:text-white/50" size={16} />
                <div className="w-full flex items-start justify-between relative gap-4  mt-0">
                  <p className="text-lg font-medium text-black dark:text-white/70 w-[80%] text-wrap break-all">
                    {address || "No address available"}
                  </p>
                  {isAddressCopied ? (
                    <PiCheck size={24} className=" text-green-900 dark:text-green-500 absolute bottom-2 right-2" />
                  ) : (
                    <Copy01Icon
                      onClick={handleCopyAddress}
                      size={24}
                      className="cursor-pointer text-icon-outline-secondary absolute bottom-2 right-2 transition-all group-hover:text-lavender-500 dark:text-white/50 dark:hover:text-white"
                      strokeWidth={2}
                    />
                  )}
                </div>
              </div>

              {/* Supported networks list */}
              <div className="flex flex-col gap-2 items-start mb-2 rounded-xl bg-transparent h-fit px-3 py-3 relative w-full border border-border-light dark:border-white/5">
                <h4 className="text-xs font-light text-text-secondary dark:text-white/50 mb-2">
                  Supported networks
                </h4>
                <div className=" flex flex-wrap gap-2 w-full h-full ">
                  {networks.map((network) => (
                    <div
                      key={network.chain.id}
                      className="flex items-center gap-0.5 p-2 bg-accent-gray dark:bg-white/10 w-fit h-[24px] rounded-full"
                    >
                      <div className="w-[16px] h-[16px]">
                        <Image
                          src={getNetworkImageUrl(network, isDark)}
                          alt={`${network.chain.name} logo`}
                          width={24}
                          height={24}
                          className=" w-full h-full object-contain rounded-full"
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
              <div className="h-[48px] w-full bg-warning-background/[36%] dark:bg-warning-background/[8%] px-3 py-2 rounded-xl mb-4 flex items-start gap-0.5">
                <InformationSquareIcon className="text-warning-foreground dark:text-warning-text w-[24px] h-[24px] mr-2" />
                <p className="text-xs font-light text-warning-foreground dark:text-warning-text leading-tight">
                  Only send funds to the supported networks, sending to an unlisted network will lead to loss of funds
                </p>
              </div>

              {/* Action button */}
              <button
                onClick={handleAcknowledge}
                className="w-full text-sm bg-lavender-500 hover:bg-lavender-600 text-white font-medium py-3 px-4 rounded-xl transition-colors focus:outline-none"
              >
                Got it
              </button>
            </DialogPanel>
          </div>

          {/* Mobile Modal */}
          <div className="fixed inset-0 sm:hidden">
            <div className="flex h-full items-end">
              <motion.div {...slideUpAnimation} className="w-full">
                <DialogPanel className="scrollbar-hide relative max-h-[90vh] w-full overflow-visible rounded-t-[20px] border border-border-light bg-white px-5 pt-6 shadow-xl dark:border-white/5 dark:bg-surface-overlay">
                  <div className="scrollbar-hide max-h-[90vh] overflow-y-scroll pb-12">
                    {/* Header with warning icon */}
                    <div className="flex flex-col items-start gap-4 mb-4">
                      <WalletDone01Icon
                        size={28}
                        className="text-text-secondary dark:text-white/50"
                      />
                      <div className="flex-1">
                        <h3
                          id="copy-address-warning-title"
                          className="text-lg font-semibold text-text-body dark:text-white mb-2"
                        >
                          You just copied your wallet address!
                        </h3>
                        <p
                          id="copy-address-warning-description"
                          className="text-sm font-normal text-text-body dark:text-white/70 max-w-[85%]"
                        >
                          If you are depositing funds to it, ensure you are depositing on only the supported networks
                        </p>
                      </div>
                    </div>

                    {/* copied address */}
                    <div className="flex flex-col items-start mb-2 rounded-xl bg-white dark:bg-surface-canvas min-h-[110px] h-fit gap-3 px-3 py-3 relative w-full border border-border-light dark:border-white/10">
                      <Wallet01Icon className="text-text-secondary dark:text-white/50" size={16} />
                      <div className="w-full flex items-start justify-between relative gap-4  mt-0">
                        <p className="text-lg font-medium text-black dark:text-white/70 w-[80%] text-wrap break-all">
                          {address || "No address available"}
                        </p>
                        {isAddressCopied ? (
                          <PiCheck size={24} className=" text-green-900 dark:text-green-500 absolute bottom-2 right-2" />
                        ) : (
                          <Copy01Icon
                            onClick={handleCopyAddress}
                            size={24}
                            className="cursor-pointer text-icon-outline-secondary absolute bottom-2 right-2 transition-all group-hover:text-lavender-500 dark:text-white/50 dark:hover:text-white"
                            strokeWidth={2}
                          />
                        )}
                      </div>
                    </div>

                    {/* Supported networks list */}
                    <div className="flex flex-col gap-2 items-start mb-2 rounded-xl bg-transparent h-fit px-3 py-3 relative w-full border border-border-light dark:border-white/5">
                      <h4 className="text-xs font-light text-text-secondary dark:text-white/50 mb-2">
                        Supported networks
                      </h4>
                      <div className=" flex flex-wrap gap-2 w-full h-full ">
                        {networks.map((network) => (
                          <div
                            key={network.chain.id}
                            className="flex items-center gap-0.5 p-2 bg-accent-gray dark:bg-white/10 w-fit h-[24px] rounded-full"
                          >
                            <div className="w-[16px] h-[16px]">
                              <Image
                                src={getNetworkImageUrl(network, isDark)}
                                alt={`${network.chain.name} logo`}
                                width={24}
                                height={24}
                                className=" w-full h-full object-contain rounded-full"
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
                    <div className="h-[48px] w-full bg-warning-background/[36%] dark:bg-warning-background/[8%] px-3 py-2 rounded-xl mb-4 flex items-start gap-0.5">
                      <InformationSquareIcon className="text-warning-foreground dark:text-warning-text w-[24px] h-[24px] mr-2" />
                      <p className="text-xs font-light text-warning-foreground dark:text-warning-text leading-tight">
                        Only send funds to the supported networks, sending to an unlisted network will lead to loss of funds
                      </p>
                    </div>

                    {/* Action button */}
                    <button
                      onClick={handleAcknowledge}
                      className="w-full text-sm bg-lavender-500 hover:bg-lavender-600 text-white font-medium py-3 px-4 rounded-xl transition-colors focus:outline-none"
                    >
                      Got it
                    </button>
                  </div>
                </DialogPanel>
              </motion.div>
            </div>
          </div>
        </Dialog>
      )}
    </AnimatePresence>
  );
};