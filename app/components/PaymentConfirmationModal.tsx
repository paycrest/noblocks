"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Dialog, DialogPanel } from "@headlessui/react";
import {
  CheckmarkCircle02Icon,
  Cancel01Icon,
} from "hugeicons-react";
import Image from "next/image";
import { classNames } from "../utils";

interface PaymentConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  tokenAmount: string | number;
  token: string;
  txHash?: string;
  explorerLink?: string;
}

const SLIDE_THRESHOLD = 0.85;
const THUMB_WIDTH = 80;
const TRACK_PADDING = 12;

function truncateHash(hash: string) {
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

export const PaymentConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  tokenAmount,
  token,
  txHash,
  explorerLink,
}: PaymentConfirmationModalProps) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const currentX = useRef(0);

  const [confirmed, setConfirmed] = useState(false);
  const [thumbOffset, setThumbOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setConfirmed(false);
      setThumbOffset(0);
    }
  }, [isOpen]);

  const getMaxDrag = useCallback(() => {
    if (!trackRef.current) return 0;
    return trackRef.current.offsetWidth - THUMB_WIDTH - TRACK_PADDING;
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (confirmed) return;
      isDragging.current = true;
      setDragging(true);
      startX.current = e.clientX;
      currentX.current = 0;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [confirmed],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current || confirmed) return;
      const maxDrag = getMaxDrag();
      const delta = e.clientX - startX.current;
      const clamped = Math.max(0, Math.min(delta, maxDrag));
      currentX.current = clamped;
      setThumbOffset(clamped);
    },
    [confirmed, getMaxDrag],
  );

  const handlePointerUp = useCallback(() => {
    if (!isDragging.current || confirmed) return;
    isDragging.current = false;
    setDragging(false);

    const maxDrag = getMaxDrag();
    if (maxDrag > 0 && currentX.current / maxDrag >= SLIDE_THRESHOLD) {
      setThumbOffset(maxDrag);
      setConfirmed(true);
      onConfirm();
    } else {
      setThumbOffset(0);
    }
  }, [confirmed, getMaxDrag, onConfirm]);

  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog open={isOpen} onClose={onClose} className="relative z-50">
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
                className="relative mx-auto w-full"
                style={{
                  maxWidth:
                    typeof window !== "undefined" && window.innerWidth > 640
                      ? "27.3125rem"
                      : "none",
                }}
              >
                <div className="w-full space-y-5 rounded-t-[30px] border border-border-light bg-white p-6 dark:border-white/10 dark:bg-surface-overlay sm:rounded-3xl">
                  {/* Header: Pending badge + Close button */}
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-50 px-3 py-1 text-xs font-medium text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400">
                      <span className="size-1.5 rounded-full bg-yellow-500" />
                      Pending
                    </span>
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-full p-1 text-text-secondary transition-colors hover:bg-gray-100 hover:text-text-body dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
                    >
                      <Cancel01Icon className="size-5" />
                    </button>
                  </div>

                  {/* Title */}
                  <h2 className="text-2xl font-medium text-text-body dark:text-white">
                    Have you received <br /> this payment?
                  </h2>

                  {/* Transaction details row */}
                  <div className="flex items-center rounded-full border border-border-light py-1.5 pl-1.5 pr-4 dark:border-white/10">
                    {/* Token + amount chip */}
                    <div className="flex items-center gap-2 rounded-full bg-gray-200/70 px-3 py-1.5 dark:bg-white/5">
                      <Image
                        src={`/logos/${token?.toLowerCase()}-logo.svg`}
                        alt={`${token} logo`}
                        width={16}
                        height={16}
                      />
                      <span className="whitespace-nowrap text-sm font-medium text-text-body dark:text-white">
                        {tokenAmount} {token}
                      </span>
                    </div>

                    <span className="mx-5 flex-1 text-center text-xs tracking-[0.3em] text-gray-300 dark:text-white/20">
                      - · · 
                    </span>

                    {/* Tx hash + View */}
                    {txHash && (
                      <div className="flex items-center gap-4">
                        <span className="whitespace-nowrap font-mono text-sm text-text-secondary dark:text-white/50">
                          {truncateHash(txHash)}
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
                    )}

                    {/* View link without hash */}
                    {!txHash && explorerLink && (
                      <a
                        href={explorerLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="whitespace-nowrap text-sm font-normal text-lavender-500 hover:underline dark:text-lavender-400"
                      >
                        View
                      </a>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-sm font-normal leading-relaxed text-text-secondary dark:text-white/50">
                    We noticed this transaction is taking longer than usual to
                    update. Please let us know if you have received your funds so
                    we can finalize your status.
                  </p>

                  {/* Slide to confirm */}
                  <div
                    ref={trackRef}
                    className={classNames(
                      "relative h-16 w-full select-none overflow-hidden rounded-2xl",
                      confirmed
                        ? "bg-green-500 dark:bg-green-600"
                        : "bg-gray-200/60 dark:bg-white/10",
                    )}
                  >
                    {confirmed ? (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex h-full items-center justify-center gap-2 text-sm font-medium text-white"
                      >
                        <CheckmarkCircle02Icon className="size-5" />
                        Confirmed
                      </motion.div>
                    ) : (
                      <>
                        {/* Progress fill that follows thumb — opacity deepens as you drag */}
                        <div
                          className="pointer-events-none absolute inset-y-0 left-0 rounded-2xl"
                          style={{
                            width: "100%",
                            backgroundColor: "#8B85F4",
                            opacity:
                              thumbOffset > 0
                                ? 0.25 + 0.75 * Math.min(thumbOffset / (getMaxDrag() || 1), 1)
                                : 0,
                            transition: dragging ? "none" : "all 0.3s ease",
                          }}
                        />

                        <span
                          className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-medium text-text-secondary dark:text-white/40"
                          style={{
                            opacity: 1 - Math.min(thumbOffset / (getMaxDrag() || 1), 1),
                            transition: dragging ? "none" : "opacity 0.3s ease",
                          }}
                        >
                          Slide to confirm
                        </span>

                        <div
                          onPointerDown={handlePointerDown}
                          onPointerMove={handlePointerMove}
                          onPointerUp={handlePointerUp}
                          onPointerCancel={handlePointerUp}
                          style={{
                            transform: `translateX(${thumbOffset}px)`,
                            transition: isDragging.current
                              ? "none"
                              : "transform 0.3s ease",
                            touchAction: "none",
                          }}
                          className="absolute left-1.5 top-1.5 flex h-[52px] w-20 cursor-grab items-center justify-center rounded-[14px] bg-white shadow-lg active:cursor-grabbing dark:bg-white"
                        >
                          <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            className="text-[#3a3578] dark:text-[#3a3578]"
                          >
                            <path
                              d="M6.5 7.5L11.5 12L6.5 16.5"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M12.5 7.5L17.5 12L12.5 16.5"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                      </>
                    )}
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
