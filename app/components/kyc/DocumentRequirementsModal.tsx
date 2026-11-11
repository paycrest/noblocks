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
        `Your address must match - ${addressDisplay}`,
        ...REQUIREMENTS.slice(1),
      ]
    : REQUIREMENTS;

  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog open={isOpen} onClose={onClose} className="relative z-[60]">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <DialogPanel>
              <motion.div
                {...fadeInOut}
                className="w-full max-w-[22rem] rounded-[20px] border-[0.3px] border-border-light bg-white p-5 shadow-xl dark:border-white/10 dark:bg-surface-overlay"
              >
                <div className="flex items-center justify-between">
                  <DialogTitle className="text-sm font-normal text-neutral-900 dark:text-white">
                    Document upload requirements
                  </DialogTitle>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-white/60 dark:hover:bg-white/10"
                    aria-label="Close"
                  >
                    <Cancel01Icon className="size-4" />
                  </button>
                </div>
                <ul className="mt-4 space-y-4 rounded-xl bg-gray-50 p-4 dark:bg-white/5">
                  {list.map((text, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-2 text-xs font-extralight text-neutral-700 dark:text-white/70"
                    >
                      <CheckmarkCircle01Icon
                        className="mt-0.5 size-4 flex-shrink-0 text-green-600 dark:text-green-500"
                        strokeWidth={2}
                      />
                      <span>{text}</span>
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
