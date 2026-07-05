"use client";

/**
 * Noblocks Play — standalone game chrome. The global Navbar/Footer are
 * intentionally NOT rendered on /play* (see AppLayout): the game is its own
 * full experience, with the animated World Cup wordmark as its identity and
 * a CTA back to the main Noblocks app.
 *
 * Desktop: collapsed icon rail on the left that slides out into a labeled
 * deck on hover (overlays the content, so nothing reflows).
 * Mobile: horizontal scrollable tabs under the header.
 */

import { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight01Icon } from "hugeicons-react";
import { NoblocksWorldCupLogo } from "../NoblocksWorldCupLogo";
import { PlayTabs } from "./PlayTabs";
import { CountdownChip } from "./CountdownChip";

/** Header shared by the game pages and the /play-demo harness. */
export const PlayHeader = ({ right }: { right?: ReactNode }) => (
  <header className="sticky top-0 z-40 border-b border-border-light bg-white/90 backdrop-blur dark:border-white/10 dark:bg-neutral-900/90">
    <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
      <Link href="/play" aria-label="Noblocks Play home" className="shrink-0">
        {/* !w overrides the component's default width safely */}
        <NoblocksWorldCupLogo className="!w-[130px] sm:!w-[160px]" />
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
  <footer className="border-t border-border-light py-6 dark:border-white/10">
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
    <PlayHeader right={<span className="hidden sm:block"><CountdownChip /></span>} />

    <div className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-4 sm:px-6">
      {/* Mobile / narrow: countdown + horizontal tabs */}
      <div className="mb-4 flex flex-col gap-3 lg:hidden">
        <div className="flex justify-end sm:hidden">
          <CountdownChip />
        </div>
        <PlayTabs />
      </div>

      <div className="lg:flex lg:items-start lg:gap-6">
        {/* Desktop: icon rail, expands over the content on hover */}
        <aside className="hidden lg:block lg:w-[4.25rem] lg:shrink-0">
          <div className="group sticky top-24 z-30">
            <div className="absolute left-0 top-0 w-[4.25rem] overflow-hidden rounded-2xl border border-border-light bg-white shadow-sm transition-[width,box-shadow] duration-200 ease-out group-hover:w-56 group-hover:shadow-xl dark:border-white/10 dark:bg-surface-overlay">
              <PlayTabs variant="rail" />
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>

    <PlayFooter />
  </div>
);
