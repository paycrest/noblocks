"use client";

import { useState } from "react";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { AnimatePresence, motion } from "framer-motion";
import { Cancel01Icon } from "hugeicons-react";
import { classNames } from "../utils";
import { primaryBtnClasses } from "./Styles";

interface BridgeConsentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccepted: () => void;
}

const RISK_COPY =
  "Conversion works differently from your Noblocks wallet. Your funds leave Noblocks and your stablecoins are routed through Li.Fi and Near Intents; independent third-party bridge protocols that Noblocks does not own, operate, or control.\n\nWe have no visibility once funds leave. Noblocks cannot freeze, recover, reverse, or guarantee your funds while they are in transit across a bridge.\n\nTransactions are irreversible. Confirmed conversions cannot be cancelled, reversed, or refunded. Network gas fees are non-refundable even if a convert fails.\nBridge protocols carry smart contract risks including the possibility of exploits. Returns and execution are not guaranteed.";

const ACK_COPY =
  "I understand that convert is powered by third-party bridge protocols and that Noblocks is not responsible for the performance or security of those protocols.";

/** Same layer as the earn consent: above the mobile wallet sheet (z-60). */
const BRIDGE_CONSENT_Z = "z-[65]";

/**
 * First-time Convert "Terms of use" disclosure: shown once per user before
 * the bridge/convert flow opens (see useBridgeAccess). Continue stays
 * disabled until the acknowledgement is ticked.
 */
export const BridgeConsentModal: React.FC<BridgeConsentModalProps> = ({
  isOpen,
  onClose,
  onAccepted,
}) => {
  const [acknowledged, setAcknowledged] = useState(false);

  const handleClose = () => {
    setAcknowledged(false);
    onClose();
  };

  const handleProceed = () => {
    if (!acknowledged) return;
    setAcknowledged(false);
    onAccepted();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog
          open={isOpen}
          onClose={handleClose}
          className={classNames("relative", BRIDGE_CONSENT_Z)}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm"
          />

          <div className="fixed inset-0 flex w-screen items-end sm:items-center sm:justify-center sm:p-4">
            <motion.div
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="w-full sm:max-w-[31.4375rem]"
            >
              <DialogPanel className="relative mx-auto flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-[30px] bg-white text-sm supports-[height:100dvh]:max-h-[90dvh] dark:bg-surface-overlay sm:max-h-[90vh] sm:rounded-[30px]">
                <div className="relative flex min-h-0 flex-1 flex-col">
                  {/* Static header */}
                  <div className="relative shrink-0 px-5 pb-4 pt-6 sm:px-6">
                    <button
                      type="button"
                      aria-label="Close"
                      onClick={handleClose}
                      className="absolute right-5 top-5 rounded-lg p-2 hover:bg-accent-gray dark:hover:bg-white/10 sm:right-6"
                    >
                      <Cancel01Icon className="size-6 text-outline-gray dark:text-white/50" />
                    </button>
                    <DialogTitle className="pr-8 text-center text-lg font-semibold leading-tight text-text-body dark:text-white sm:text-xl">
                      Terms of use
                    </DialogTitle>
                  </div>

                  {/* Scrollable risk copy */}
                  <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6">
                    <div className="rounded-2xl border border-border-light bg-accent-gray/50 px-4 py-4 dark:border-white/10 dark:bg-black/20">
                      <p className="whitespace-pre-line text-sm leading-5 text-text-secondary dark:text-white/50">
                        {RISK_COPY}
                      </p>
                    </div>
                  </div>

                  {/* Acknowledgement + Continue */}
                  <div className="flex w-full shrink-0 flex-col gap-5 rounded-t-3xl bg-background-neutral px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 dark:bg-[#2c2c2c] sm:px-6 sm:pb-6">
                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border-light bg-white px-4 py-3 dark:border-white/10 dark:bg-white/5">
                      <input
                        type="checkbox"
                        checked={acknowledged}
                        onChange={(e) => setAcknowledged(e.target.checked)}
                        className="mt-0.5 size-[19px] shrink-0 cursor-pointer rounded border-2 border-border-light accent-lavender-500 dark:border-white/30"
                      />
                      <span className="text-sm leading-5 text-text-secondary dark:text-white/50">
                        {ACK_COPY}
                      </span>
                    </label>

                    <button
                      type="button"
                      disabled={!acknowledged}
                      onClick={handleProceed}
                      className={classNames(
                        primaryBtnClasses,
                        "w-full",
                        !acknowledged && "cursor-not-allowed opacity-40",
                      )}
                    >
                      Continue
                    </button>
                  </div>
                </div>
              </DialogPanel>
            </motion.div>
          </div>
        </Dialog>
      )}
    </AnimatePresence>
  );
};
