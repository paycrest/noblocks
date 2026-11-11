"use client";

import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { motion, AnimatePresence } from "framer-motion";
import { Cancel01Icon, CheckmarkCircle01Icon } from "hugeicons-react";
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
                className="w-full max-w-[412px] rounded-[20px] border-[0.3px] border-border-light bg-white p-5 shadow-xl dark:border-white/10 dark:bg-surface-overlay"
              >
                <div className="flex items-center justify-between gap-4">
                  <DialogTitle className="text-lg font-semibold leading-6 text-text-body dark:text-white">
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
                      className="flex items-start gap-2 text-sm font-normal leading-5 text-text-body dark:text-white/80"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center">
                        <CheckmarkCircle01Icon
                          className="size-5 text-[#39C65D]"
                          strokeWidth={2}
                        />
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
