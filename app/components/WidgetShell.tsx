"use client";
import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  SquareLock02Icon,
  Wallet01Icon,
} from "hugeicons-react";
import { usePrivy } from "@privy-io/react-auth";

import { MobileDropdown } from "./MobileDropdown";
import { NoblocksLogo } from "./ImageAssets";
import { useInjectedWallet } from "../context";

/**
 * Compact card chrome for the embedded /widget experience: a flat rounded
 * card that FILLS the entire iframe viewport — no margins, no shadow; the
 * partner sizes/rounds/floats the widget by styling the iframe element
 * itself, and the rounded corners show against the transparent backdrop.
 * Inside: a sticky wallet pill (wallet icon + chevron) opening the mobile
 * wallet drawer, the swap step, and a "Secured by Noblocks" footer row.
 * Dismissing the iframe is owned by the host page (backdrop, host close
 * control, etc.) — the widget does not render a close button.
 * Replaces Navbar/Footer/HomePage, which are hidden in embed mode.
 *
 * The recommended iframe width (~393-420px, per Figma frame 2429:118606) is
 * below Tailwind's `sm` breakpoint, so the app renders its mobile UI inside
 * the widget by design.
 */
export function WidgetShell({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = usePrivy();
  const { isInjectedWallet } = useInjectedWallet();
  const [isWalletDrawerOpen, setIsWalletDrawerOpen] = useState(false);

  const isConnected = (ready && authenticated) || isInjectedWallet;

  return (
    <div className="w-full">
      {/* Fixed full-viewport height: short steps (e.g. the pending/status
          screen) keep the footer pinned to the bottom edge instead of the
          card shrinking to fit; tall content scrolls internally above the
          footer. The wallet header sits outside the scroll region so it
          stays visible while the form scrolls. */}
      <div className="flex h-dvh w-full flex-col rounded-3xl bg-white p-4 dark:bg-neutral-900">
        {isConnected && (
          <div className="mb-3 flex min-h-10 flex-shrink-0 items-center justify-end gap-2">
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
          </div>
        )}

        <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto">
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
