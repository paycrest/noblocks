"use client";

/**
 * Noblocks Play — standalone game chrome. The global Navbar/Footer are
 * intentionally NOT rendered on /play* (see AppLayout): the game is its own
 * full experience, with the Noblocks wordmark as its identity.
 *
 * Desktop: collapsed icon rail on the left that expands in flow on hover,
 * pushing the content right like a slide-out panel.
 * Mobile: fixed bottom tab bar.
 *
 * When campaignEnded, hide live-game nav (tabs + countdown) so /play reads
 * as an announcement; /play/admin still uses this shell without game chrome.
 */

import { ReactNode } from "react";
import Link from "next/link";
import { NoblocksLogo, NoblocksLogoIcon } from "../ImageAssets";
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
        {/* Same split + sizing as the main Navbar: 18px icon in a gray chip on
            mobile, wordmark from sm up */}
        <NoblocksLogoIcon className="size-[18px] sm:hidden" />
        <NoblocksLogo className="max-sm:hidden" />
      </Link>
      <div className="flex items-center gap-2">{right}</div>
    </div>
  </header>
);

const PlayFooter = ({ campaignEnded }: { campaignEnded?: boolean }) => (
  // Mobile has the bottom tab bar instead — the footer only earns its keep
  // on wider screens. When the campaign has ended there is no bottom bar,
  // so show the footer at all breakpoints.
  <footer
    className={`border-t border-border-light py-6 dark:border-white/10 ${
      campaignEnded ? "" : "max-lg:hidden"
    }`}
  >
    <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 text-xs text-text-secondary dark:text-white/40 sm:px-6">
      <span>
        {campaignEnded
          ? "Noblocks Play · Season complete"
          : "Noblocks Play · Premier League Fantasy"}
      </span>
      <span className="flex items-center gap-4">
        {!campaignEnded && (
          <Link
            href="/play/terms"
            className="transition-colors hover:text-text-body dark:hover:text-white"
          >
            Terms &amp; Conditions
          </Link>
        )}
      </span>
    </div>
  </footer>
);

export const PlayShell = ({
  children,
  campaignEnded = false,
}: {
  children: ReactNode;
  campaignEnded?: boolean;
}) => (
  <div className="flex min-h-dvh flex-col">
    <PlayHeader />

    <div
      className={`mx-auto w-full max-w-6xl flex-1 px-4 pt-4 sm:px-6 ${
        campaignEnded ? "pb-10" : "pb-28 lg:pb-20"
      }`}
    >
      {!campaignEnded && (
        /* The ONE countdown pill: first element under the header, right-aligned
            (all breakpoints — it is deliberately not in the header). */
        <div className="mb-4 flex justify-end">
          <CountdownChip />
        </div>
      )}

      <div className="lg:flex lg:items-start lg:gap-6">
        {!campaignEnded && (
          /* Desktop: icon rail that expands IN FLOW on hover — a slide-out
              panel that pushes the content right, never an overlay. */
          <aside className="group hidden lg:block lg:w-[4.25rem] lg:shrink-0 lg:transition-[width] lg:duration-200 lg:ease-out lg:hover:w-56">
            <div className="sticky top-24 overflow-hidden rounded-2xl border border-border-light bg-white shadow-sm dark:border-white/10 dark:bg-surface-overlay">
              <PlayTabs variant="rail" />
            </div>
          </aside>
        )}

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>

    <PlayFooter campaignEnded={campaignEnded} />
    {!campaignEnded && <PlayTabs variant="bottom" />}
  </div>
);
