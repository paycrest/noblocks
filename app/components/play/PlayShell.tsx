"use client";

/**
 * Noblocks Play — standalone game chrome. The global Navbar/Footer are
 * intentionally NOT rendered on /play* (see AppLayout): the game is its own
 * full experience, with the animated World Cup wordmark as its identity and
 * a CTA back to the main Noblocks app.
 *
 * Desktop: collapsed icon rail on the left that expands in flow on hover,
 * pushing the content right like a slide-out panel.
 * Mobile: fixed bottom tab bar.
 */

import { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight01Icon } from "hugeicons-react";
import { NoblocksWorldCupLogo } from "../NoblocksWorldCupLogo";
import { NoblocksAnimatedIcon } from "../NoblocksAnimatedIcon";
import { PlayTabs } from "./PlayTabs";
import { CountdownChip } from "./CountdownChip";

/** Header shared by the game pages and the /play-demo harness. */
export const PlayHeader = ({ right }: { right?: ReactNode }) => (
  <header className="sticky top-0 z-40 border-b border-border-light bg-white/90 backdrop-blur dark:border-white/10 dark:bg-neutral-900/90">
    <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
      <Link
        href="/play"
        aria-label="Noblocks Play home"
        className="flex shrink-0 items-center max-sm:min-h-9 max-sm:rounded-lg max-sm:bg-accent-gray max-sm:p-2 dark:max-sm:bg-white/10"
      >
        {/* Same split + sizing as the main Navbar: 18px animated icon in a
            gray chip on mobile, wordmark from sm up */}
        <NoblocksAnimatedIcon className="size-[18px] sm:hidden" />
        {/* !w overrides the component's default width safely */}
        <NoblocksWorldCupLogo className="!w-[160px] max-sm:hidden" />
      </Link>
      <div className="flex items-center gap-2">
        {right}
        <Link
          href="/"
          className="flex min-h-9 items-center gap-1.5 rounded-xl border border-border-light px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-accent-gray hover:text-text-body dark:border-white/10 dark:text-white/60 dark:hover:bg-white/5 dark:hover:text-white sm:min-h-10 sm:px-4 sm:text-sm"
        >
          Back to Noblocks
          <ArrowUpRight01Icon className="size-4" />
        </Link>
      </div>
    </div>
  </header>
);

const PlayFooter = () => (
  // Mobile has the bottom tab bar instead — the footer only earns its keep
  // on wider screens.
  <footer className="border-t border-border-light py-6 max-lg:hidden dark:border-white/10">
    <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 text-xs text-text-secondary dark:text-white/40 sm:px-6">
      <span>Noblocks Play · World Cup 2026 Fantasy League</span>
      <span className="flex items-center gap-4">
        <Link
          href="/play/terms"
          className="transition-colors hover:text-text-body dark:hover:text-white"
        >
          Terms &amp; Conditions
        </Link>
        <Link
          href="/"
          className="transition-colors hover:text-text-body dark:hover:text-white"
        >
          Powered by Noblocks →
        </Link>
      </span>
    </div>
  </footer>
);

export const PlayShell = ({ children }: { children: ReactNode }) => (
  <div className="flex min-h-dvh flex-col">
    <PlayHeader />

    <div className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-4 sm:px-6 lg:pb-20">
      {/* The ONE countdown pill: first element under the header, right-aligned
          (all breakpoints — it is deliberately not in the header). */}
      <div className="mb-4 flex justify-end">
        <CountdownChip />
      </div>

      <div className="lg:flex lg:items-start lg:gap-6">
        {/* Desktop: icon rail that expands IN FLOW on hover — a slide-out
            panel that pushes the content right, never an overlay. */}
        <aside className="group hidden lg:block lg:w-[4.25rem] lg:shrink-0 lg:transition-[width] lg:duration-200 lg:ease-out lg:hover:w-56">
          <div className="sticky top-24 overflow-hidden rounded-2xl border border-border-light bg-white shadow-sm dark:border-white/10 dark:bg-surface-overlay">
            <PlayTabs variant="rail" />
          </div>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>

    <PlayFooter />
    {/* Mobile app-style navigation */}
    <PlayTabs variant="bottom" />
  </div>
);
