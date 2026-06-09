"use client";

import { useState } from "react";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { AnimatePresence, motion } from "framer-motion";
import { Cancel01Icon } from "hugeicons-react";
import { EARN_LEARN_MORE_URL } from "../lib/earnConsent";
import { classNames } from "../utils";
import { primaryBtnClasses, secondaryBtnClasses } from "./Styles";

interface EarnConsentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccepted: () => void;
}

const RISK_COPY =
  "Earn works differently from your Noblocks wallet. When you use Earn, your funds leave our platform entirely and are managed by independent third-party blockchain protocols that we do not own, operate, or control.\n\nYour USDC will be transferred to Vesu, a decentralized lending protocol on the Starknet blockchain.\n\nNoblocks will have no access to your funds while they are in Earn. We cannot freeze, recover, reverse, or guarantee your funds once they leave our platform - This is not a savings account. There is no deposit insurance. Returns are not guaranteed.";

/** Above mobile wallet sheet (z-60); below copy-address warning (z-80). */
const EARN_CONSENT_Z = "z-[65]";

export const EarnConsentModal: React.FC<EarnConsentModalProps> = ({
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
          className={classNames("relative", EARN_CONSENT_Z)}
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
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 30,
              }}
              className="w-full"
            >
              <DialogPanel
                className="relative mx-auto flex w-full flex-col overflow-hidden rounded-t-[30px] bg-white text-sm dark:bg-surface-overlay max-h-[90dvh] sm:max-h-[90vh] sm:rounded-3xl"
                style={{
                  maxWidth:
                    typeof window !== "undefined" && window.innerWidth > 640
                      ? "31.4375rem"
                      : undefined,
                }}
              >
                <div className="relative flex min-h-0 flex-1 flex-col">
                  {/* Static header */}
                  <div className="relative shrink-0 px-5 pb-3 pt-5 sm:px-6 sm:pt-6">
                    <button
                      type="button"
                      aria-label="Close"
                      onClick={handleClose}
                      className="absolute right-5 top-5 rounded-lg p-2 hover:bg-accent-gray dark:hover:bg-white/10 sm:right-6 sm:top-6"
                    >
                      <Cancel01Icon className="size-6 text-outline-gray dark:text-white/50" />
                    </button>
                    <DialogTitle className="pr-8 text-center text-lg font-semibold leading-tight text-text-body sm:text-xl dark:text-white">
                      Before you start earning
                    </DialogTitle>
                  </div>

                  {/* Scrollable risk copy */}
                  <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 sm:px-6">
                    <div className="rounded-3xl border border-border-light bg-accent-gray/50 px-4 py-4 dark:border-white/10 dark:bg-black/20">
                      <p className="whitespace-pre-line text-sm leading-6 text-text-body dark:text-white/50">
                        {RISK_COPY}
                      </p>
                    </div>
                  </div>

                  <div className="flex w-full shrink-0 flex-col gap-4 rounded-t-3xl bg-[#2c2c2c] px-4 py-3 dark:bg-[#2c2c2c]">
                    <label className="flex cursor-pointer items-start gap-3 rounded-3xl px-4 py-3 dark:bg-white/5">
                      <input
                        type="checkbox"
                        checked={acknowledged}
                        onChange={(e) => setAcknowledged(e.target.checked)}
                        className="mt-0.5 size-[19px] shrink-0 cursor-pointer rounded border-2 border-border-light accent-lavender-500 dark:border-white/30"
                      />
                      <span className="text-sm leading-5 text-text-body dark:text-white/50">
                        By proceeding, I understand that Earn is powered by
                        third-party protocols and that Noblocks is not
                        responsible for the performance or security of those
                        protocols.
                      </span>
                    </label>

                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                      <a
                        href={EARN_LEARN_MORE_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={classNames(
                          secondaryBtnClasses,
                          "w-full font-normal sm:w-auto sm:min-w-[108px]",
                        )}
                      >
                        Learn more
                      </a>
                      <button
                        type="button"
                        disabled={!acknowledged}
                        onClick={handleProceed}
                        className={classNames(
                          primaryBtnClasses,
                          "w-full sm:w-full sm:min-w-[140px]",
                          !acknowledged && "cursor-not-allowed opacity-40",
                        )}
                      >
                        Start earning
                      </button>
                    </div>
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
