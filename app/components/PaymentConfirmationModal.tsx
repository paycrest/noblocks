"use client";
import { useState, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Dialog, DialogPanel } from "@headlessui/react";
import { Cancel01Icon, Loading03Icon } from "hugeicons-react";
import Image from "next/image";
import { classNames } from "../utils";
import { primaryBtnClasses } from "./Styles";

interface PaymentConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  tokenAmount: string | number;
  token: string;
  /** Destination wallet where funds are going. */
  recipientAddress?: string;
  explorerLink?: string;
}

function truncateAddress(address: string) {
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}...${address.slice(-5)}`;
}

export const PaymentConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  tokenAmount,
  token,
  recipientAddress,
  explorerLink,
}: PaymentConfirmationModalProps) => {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setConfirming(false);
    }
  }, [isOpen]);

  const handleConfirm = useCallback(async () => {
    if (confirming) return;
    setConfirming(true);
    try {
      await Promise.resolve(onConfirm());
    } catch {
      // Parent shows toast; keep modal open so user can retry.
    } finally {
      setConfirming(false);
    }
  }, [confirming, onConfirm]);

  const tokenLogo = token?.toLowerCase() || "usdc";

  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog
          open={isOpen}
          onClose={() => {
            if (!confirming) onClose();
          }}
          className="relative z-[70]"
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
              <DialogPanel className="relative mx-auto w-full sm:max-w-[27.3125rem]">
                <div className="w-full space-y-5 rounded-t-[30px] border border-border-light bg-white p-6 dark:border-white/10 dark:bg-surface-overlay sm:rounded-3xl">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 text-xs font-normal text-amber-600 dark:bg-white/10 dark:text-[#E8C84A]">
                      <Loading03Icon className="size-3.5 animate-spin" />
                      Pending
                    </span>
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={confirming}
                      className="rounded-full p-1.5 text-text-secondary transition-colors hover:bg-gray-100 hover:text-text-body disabled:opacity-50 dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
                      aria-label="Close"
                    >
                      <Cancel01Icon className="size-5" />
                    </button>
                  </div>

                  <h2 className="text-[26px] font-medium leading-7 text-text-body dark:text-white/80">
                    Have you received
                    <br />
                    this payment?
                  </h2>

                  <div className="flex items-center rounded-full border border-border-light py-1.5 pl-1.5 pr-4 dark:border-white/10">
                    <div className="flex items-center gap-2 rounded-full bg-gray-200/70 px-3 py-1.5 dark:bg-white/5">
                      <Image
                        src={`/logos/${tokenLogo}-logo.svg`}
                        alt={`${token} logo`}
                        width={16}
                        height={16}
                      />
                      <span className="whitespace-nowrap text-sm font-medium text-text-body dark:text-white">
                        {tokenAmount} {token}
                      </span>
                    </div>

                    <span
                      aria-hidden
                      className="mx-4 flex-1 truncate text-center font-medium text-xs tracking-[0.35em] text-gray-300 dark:text-white/20"
                    >
                      -·······
                    </span>

                    {recipientAddress ? (
                      <div className="flex items-center gap-3">
                        <span className="whitespace-nowrap font-mono text-sm text-text-secondary dark:text-white/50">
                          {truncateAddress(recipientAddress)}
                        </span>
                        {explorerLink && (
                          <a
                            href={explorerLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="whitespace-nowrap text-sm font-medium text-lavender-500 dark:text-lavender-400"
                          >
                            View
                          </a>
                        )}
                      </div>
                    ) : (
                      explorerLink && (
                        <a
                          href={explorerLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="whitespace-nowrap text-sm font-medium text-lavender-500 dark:text-lavender-400"
                        >
                          View
                        </a>
                      )
                    )}
                  </div>

                  <p className="text-sm font-normal leading-5 text-text-secondary dark:text-white/50">
                    We noticed this transaction is taking longer than usual to
                    update. Please let us know if you have received your funds
                    so we can finalize your status.
                  </p>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={confirming}
                      className={classNames(
                        primaryBtnClasses,
                        "!min-h-12 !min-w-0 !flex-none !rounded-2xl border-none px-8 text-sm leading-6 shadow-none",
                      )}
                    >
                      No, I haven&apos;t
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirm}
                      disabled={confirming}
                      className="flex min-h-12 min-w-0 flex-1 items-center justify-center rounded-2xl border-none bg-gray-100 px-5 text-sm font-medium leading-6 text-neutral-900 shadow-none transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed hover:bg-gray-200 dark:bg-white/10 dark:text-white dark:hover:bg-white/[0.14] dark:focus-visible:ring-offset-neutral-900"
                    >
                      {confirming ? "Confirming…" : "Yes, Payment Received"}
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
