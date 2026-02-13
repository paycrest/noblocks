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

const ENABLED = process.env.NEXT_PUBLIC_MAINTENANCE_NOTICE_ENABLED === "true";

/** Simple deterministic hash for the noticeKey so each schedule gets its own. */
function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

// ---------------------------------------------------------------------------
// Parse the end-of-maintenance datetime from the schedule text so the notice
// auto-hides once the window is over — no code change or redeploy needed.
//
// Expected format examples:
//   "Friday, February 13th, from 7:00 PM to 11:00 PM WAT"
//   "Friday, February 13th, from 10:00 PM to 1:00 AM WAT"  ← overnight
// ---------------------------------------------------------------------------

const TZ_OFFSETS: Record<string, number> = {
  UTC: 0, GMT: 0,
  WAT: 1, CET: 1,
  CAT: 2, CEST: 2, EET: 2, SAST: 2,
  EAT: 3, EEST: 3,
  EST: -5, CST: -6, MST: -7, PST: -8,
  EDT: -4, CDT: -5, MDT: -6, PDT: -7,
  IST: 5.5, SGT: 8, JST: 9, AEST: 10,
};

const MONTH_MAP: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

function parse12hTime(h: number, m: number, meridiem: string): { hours: number; minutes: number } {
  let hours = h;
  if (meridiem === "PM" && hours !== 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  return { hours, minutes: m };
}

/**
 * Parse the end datetime from the schedule string.
 * Handles overnight windows (e.g. 10 PM → 1 AM → end rolls to the next day).
 * Returns a Date in UTC, or null if parsing fails.
 */
function parseScheduleEndTime(schedule: string): Date | null {
  if (!schedule) return null;
  try {
    // Extract month + day: "February 13th"
    const dateMatch = schedule.match(
      /(\b(?:January|February|March|April|May|June|July|August|September|October|November|December))\s+(\d{1,2})(?:st|nd|rd|th)?/i,
    );
    if (!dateMatch) return null;
    const month = MONTH_MAP[dateMatch[1].toLowerCase()];
    const day = parseInt(dateMatch[2], 10);
    if (month === undefined || isNaN(day)) return null;

    // Extract start time: "from 10:03 PM"
    const startMatch = schedule.match(/from\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    // Extract end time: "to 01:04 AM"
    const endMatch = schedule.match(/to\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!endMatch) return null;

    const end = parse12hTime(
      parseInt(endMatch[1], 10),
      parseInt(endMatch[2], 10),
      endMatch[3].toUpperCase(),
    );

    // Extract timezone abbreviation (last uppercase word)
    const tzMatch = schedule.match(/([A-Z]{2,5})\s*$/);
    const tzName = tzMatch ? tzMatch[1] : "UTC";
    const tzOffset = TZ_OFFSETS[tzName] ?? 0;

    const year = new Date().getFullYear();

    // Check for overnight: if we also matched a start time, compare them.
    // When end < start (e.g. 10 PM → 1 AM), the end falls on the next day.
    let extraDays = 0;
    if (startMatch) {
      const start = parse12hTime(
        parseInt(startMatch[1], 10),
        parseInt(startMatch[2], 10),
        startMatch[3].toUpperCase(),
      );
      const startMinutes = start.hours * 60 + start.minutes;
      const endMinutes = end.hours * 60 + end.minutes;
      if (endMinutes <= startMinutes) {
        extraDays = 1; // end time is the next calendar day
      }
    }

    const utcMs =
      Date.UTC(year, month, day + extraDays, end.hours, end.minutes) -
      tzOffset * 60 * 60 * 1000;

    return new Date(utcMs);
  } catch {
    return null;
  }
}

/** Check (client-side) whether the maintenance window has already ended. */
function isMaintenanceOver(): boolean {
  const endTime = parseScheduleEndTime(SCHEDULE);
  if (!endTime) return false; // can't parse → stay visible (safe default)
  return Date.now() > endTime.getTime();
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
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!config.enabled) return;
    // Check immediately
    if (isMaintenanceOver()) { setExpired(true); return; }
    // Re-check every 10 minutes so it auto-hides without a reload
    const id = setInterval(() => {
      if (isMaintenanceOver()) { setExpired(true); clearInterval(id); }
    }, 600_000);
    return () => clearInterval(id);
  }, [config.enabled]);

  if (!config.enabled || expired) return null;

  return (
    <motion.div
 className="fixed left-0 right-0 top-16 z-10 mt-1 hidden min-h-[4.5rem] items-center bg-[#2D77E2] py-2 sm:flex"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between px-4 lg:px-8">
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
    if (isMaintenanceOver()) return;
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
