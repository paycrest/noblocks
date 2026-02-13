"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { motion, AnimatePresence } from "framer-motion";

export interface MaintenanceNoticeConfig {
  /** Master toggle – when false the modal never renders. */
  enabled: boolean;
  title: string;
  titleEmphasis: string;
  body: string;
  footnote?: string;
  buttonText: string;
  noticeKey: string;
}


const SCHEDULE =
  process.env.NEXT_PUBLIC_MAINTENANCE_SCHEDULE || "";

const ENABLED = !!process.env.NEXT_PUBLIC_MAINTENANCE_NOTICE_ENABLED;

/** Simple deterministic hash for the noticeKey so each schedule gets its own. */
function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

export const DEFAULT_MAINTENANCE_CONFIG: MaintenanceNoticeConfig = {
  enabled: ENABLED && SCHEDULE.length > 0,
  title: "We are improving",
  titleEmphasis: "your experience.",
  body: `A scheduled maintenance will take place on **${SCHEDULE}** to help improve your experience. Some services may be temporarily unavailable during this time.`,
  footnote:
    "We appreciate your patience while we make these improvements.",
  buttonText: "Got it",
  noticeKey: `maintenance-${simpleHash(SCHEDULE)}`,
};


const STORAGE_PREFIX = "noblocks_notice_dismissed_";

function isDismissed(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${key}`) === "1";
  } catch {
    return false;
  }
}

function markDismissed(key: string) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, "1");
  } catch {
    // Storage may be unavailable (private browsing etc.)
  }
}

/** Render a string where **bold** segments become <strong>. */
function RichText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className={className}>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-bold">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Persistent top-bar banner (does NOT dismiss — visible as long as enabled)
// ---------------------------------------------------------------------------

export function MaintenanceBanner({
  config = DEFAULT_MAINTENANCE_CONFIG,
}: {
  config?: MaintenanceNoticeConfig;
}) {
  if (!config.enabled) return null;

  return (
    <motion.div
      className="fixed left-0 right-0 top-16 z-30 mt-1 flex min-h-14 w-full items-center bg-[#0860F0] px-0 max-w-[1480px] mx-auto"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <div className="relative flex w-full items-center sm:pr-8">
        {/* Mobile illustration */}
        <div className="absolute left-0 top-0 z-0 sm:hidden">
          <Image
            src="/images/banner-illustration-mobile.svg"
            alt=""
            width={37}
            height={104}
            priority
            className="h-full w-auto"
          />
        </div>
        {/* Desktop illustration */}
        <div className="z-10 hidden flex-shrink-0 sm:static sm:mr-4 sm:block">
          <Image
            src="/images/banner-illustration.svg"
            alt=""
            width={74}
            height={64}
            priority
          />
        </div>

        {/* Copy */}
        <div className="relative z-10 flex flex-grow items-center justify-between gap-3 px-4 py-3 pl-12 sm:pl-0">
          <RichText
            text={`Scheduled maintenance on **${SCHEDULE}**. Some services may be temporarily unavailable.`}
            className="text-xs font-medium leading-snug text-white/90 sm:text-sm"
          />
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Dismissible modal
// ---------------------------------------------------------------------------

interface MaintenanceNoticeModalProps {
  config?: MaintenanceNoticeConfig;
}

export function MaintenanceNoticeModal({
  config = DEFAULT_MAINTENANCE_CONFIG,
}: MaintenanceNoticeModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!config.enabled) return;
    if (isDismissed(config.noticeKey)) return;
    // Small delay so it doesn't flash on initial page load
    const timer = setTimeout(() => setIsOpen(true), 400);
    return () => clearTimeout(timer);
  }, [config.enabled, config.noticeKey]);

  const dismiss = useCallback(() => {
    markDismissed(config.noticeKey);
    setIsOpen(false);
  }, [config.noticeKey]);

  if (!config.enabled) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog
          open={isOpen}
          onClose={dismiss}
          className="relative z-[70]"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            aria-hidden="true"
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
              className="w-full sm:max-w-lg"
            >
              <DialogPanel>
                <div className="rounded-t-[28px] bg-[#0860F0] px-8 sm:px-6 pb-8 pt-8 sm:rounded-3xl">
                  <div className="mb-6 flex items-center -space-x-2">
                      <Image
                        src="/images/tokens.svg"
                        alt="tokens"
                        width={129.97}
                        height={115.2}
                        loading="lazy"
                        className="object-cover"
                      />
                  </div>

                  <DialogTitle className="mb-4 text-[38px] font-semibold font-inter leading-[37px] text-white sm:text-[38px]">
                    {config.title}
                    <br />
                    <em className="font-serif text-[34px] sm:text-[38px]">{config.titleEmphasis}</em>
                  </DialogTitle>

                  <RichText
                    text={config.body}
                    className="text-sm leading-relaxed text-white mt-2"
                  />

                  {config.footnote && (
                    <p className="mt-4 text-sm leading-relaxed text-white">
                      {config.footnote}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={dismiss}
                    className="mt-6 min-h-12 w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-neutral-900 transition-all hover:bg-white/90 active:scale-[0.98]"
                  >
                    {config.buttonText}
                  </button>
                </div>
              </DialogPanel>
            </motion.div>
          </div>
        </Dialog>
      )}
    </AnimatePresence>
  );
}
