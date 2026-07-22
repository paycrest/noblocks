"use client";
import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  SquareLock02Icon,
  Wallet01Icon,
} from "hugeicons-react";
import { usePrivy } from "@privy-io/react-auth";

import { MobileDropdown } from "./MobileDropdown";
import { NoblocksLogo } from "./ImageAssets";
import { useEmbed } from "../context/EmbedContext";
import { useInjectedWallet } from "../context";

/**
 * Compact card chrome for the embedded /widget experience: a flat rounded
 * card (no drop shadow — the host page's own shadow/framing applies, if any)
 * on a transparent backdrop so the host page shows through, a minimized
 * wallet pill (wallet icon + chevron) opening the mobile wallet drawer, a
 * close X in the card header, the swap step, and a "Secured by Noblocks"
 * footer row.
 * Replaces Navbar/Footer/HomePage, which are hidden in embed mode.
 *
 * Geometry: 393px card (Figma frame 2429:118606), centered, no extra gutter.
 * The floating-element rules in globals.css share this width. The card width
 * is below Tailwind's `sm` breakpoint, so the app renders its mobile UI
 * inside the widget by design.
 */
export function WidgetShell({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = usePrivy();
  const { isInjectedWallet } = useInjectedWallet();
  const { parentOrigin, postToHost } = useEmbed();
  const [isWalletDrawerOpen, setIsWalletDrawerOpen] = useState(false);

  const isConnected = (ready && authenticated) || isInjectedWallet;

  return (
    <div className="relative mx-auto min-h-dvh w-full max-w-[24.5625rem] py-3">
      {/* Card grows with content up to the viewport; beyond that everything
          above the "Secured by" footer scrolls internally (the wallet header
          scrolls with the content — only the footer stays pinned). */}
      <div className="flex max-h-[calc(100dvh-1.5rem)] w-full flex-col rounded-3xl bg-white p-4 dark:bg-neutral-900">
        <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto">
        <div className="mb-3 flex min-h-10 items-center justify-end gap-2">
          {isConnected && (
            <>
              <button
                type="button"
                title="Wallet"
                aria-label="Open wallet"
                onClick={() => setIsWalletDrawerOpen(true)}
                className="flex items-center gap-1 rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-white/10"
              >
                <Wallet01Icon className="size-5 text-outline-gray dark:text-white/80" />
                <ArrowDown01Icon className="size-4 text-outline-gray dark:text-white/50" />
              </button>
              <AnimatePresence>
                <MobileDropdown
                  isOpen={isWalletDrawerOpen}
                  onClose={() => setIsWalletDrawerOpen(false)}
                />
              </AnimatePresence>
            </>
          )}
          {/* The host removes the iframe on noblocks:close; only useful when
              we can actually reach a host. */}
          {parentOrigin && (
            <button
              type="button"
              title="Close widget"
              aria-label="Close widget"
              onClick={() => postToHost("noblocks:close")}
              className="flex size-9 items-center justify-center rounded-xl bg-gray-50 transition-colors hover:bg-gray-100 dark:bg-white/10 dark:hover:bg-white/20"
            >
              <Cancel01Icon className="size-4 text-outline-gray dark:text-white/50" />
            </button>
          )}
        </div>

          {children}
        </div>

        <a
          href="https://noblocks.xyz"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex flex-shrink-0 items-center justify-center gap-2 border-t border-gray-100 pb-2 pt-5 text-sm text-gray-500 transition-opacity hover:opacity-80 dark:border-white/5 dark:text-white/50"
        >
          <span className="flex size-6 items-center justify-center rounded-full bg-pink-500">
            <SquareLock02Icon className="size-3.5 text-white" />
          </span>
          <span>Secured by</span>
          <NoblocksLogo className="h-3.5 w-auto" />
          <ArrowRight01Icon className="size-4" />
        </a>
      </div>
    </div>
  );
}
