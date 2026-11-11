"use client";

import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { motion, AnimatePresence } from "framer-motion";
import { Cancel01Icon } from "hugeicons-react";
import type { ReactNode } from "react";
import { fadeInOut } from "../AnimatedComponents";

const REQUIREMENTS: ReactNode[] = [
  "Your address must match the address you entered",
  <>
    Must be <strong className="font-medium">valid and not expired</strong>
  </>,
  <>
    Must clearly show your{" "}
    <strong className="font-medium">name, phone</strong> and{" "}
    <strong className="font-medium">residential address</strong>
  </>,
  "Should not be blurry",
];

interface DocumentRequirementsModalProps {
  isOpen: boolean;
  onClose: () => void;
  addressDisplay?: string;
}

export function DocumentRequirementsModal({
  isOpen,
  onClose,
  addressDisplay,
}: DocumentRequirementsModalProps) {
  const list = addressDisplay
    ? [
        <>
          Your address must match -{" "}
          <strong className="font-medium">{addressDisplay}</strong>
        </>,
        ...REQUIREMENTS.slice(1),
      ]
    : REQUIREMENTS;

  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog open={isOpen} onClose={onClose} className="relative z-[80]">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <DialogPanel>
              <motion.div
                {...fadeInOut}
                className="font-general-sans w-full max-w-[412px] rounded-[20px] border-[0.3px] border-border-light bg-white p-5 shadow-xl dark:border-white/10 dark:bg-surface-overlay"
              >
                <div className="flex items-center justify-between gap-4">
                  <DialogTitle className="font-inter text-lg font-semibold leading-6 text-text-body dark:text-white">
                    Document upload requirements
                  </DialogTitle>
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex size-5 shrink-0 items-center justify-center text-text-secondary hover:text-text-body dark:text-white/50 dark:hover:text-white"
                    aria-label="Close"
                  >
                    <Cancel01Icon className="size-5" />
                  </button>
                </div>
                <ul className="mt-4 space-y-4 rounded-2xl bg-background-neutral p-4 dark:bg-white/5">
                  {list.map((text, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-2 text-sm font-normal leading-5 tracking-[-0.01em] text-text-body dark:text-white/80"
                    >
                      <span className="flex size-7 shrink-0 items-start justify-center">
                        <svg
                          className="size-5"
                          width="20"
                          height="20"
                          viewBox="0 0 20 20"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M10 20C4.47715 20 0 15.5229 0 10C0 4.47715 4.47715 0 10 0C15.5229 0 20 4.47715 20 10C20 15.5229 15.5229 20 10 20ZM14.4355 7.80482C14.7645 7.41014 14.7112 6.82357 14.3165 6.49467C13.9218 6.16578 13.3352 6.2191 13.0063 6.61378L9.00726 11.4127L6.93685 9.34223C6.57356 8.97898 5.98458 8.97898 5.62129 9.34223C5.25802 9.70549 5.25802 10.2945 5.62129 10.6578L8.412 13.4485C8.59684 13.6333 8.85079 13.7318 9.11191 13.72C9.37302 13.7081 9.61712 13.587 9.78437 13.3862L14.4355 7.80482Z"
                            fill="#39C65D"
                          />
                        </svg>
                      </span>
                      <span className="pt-1.5">{text}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            </DialogPanel>
          </div>
        </Dialog>
      )}
    </AnimatePresence>
  );
}
