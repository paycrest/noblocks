"use client";

/**
 * End-of-campaign announcement for Noblocks Play.
 * Shown at /play when fantasyCampaignEnded; deep links redirect here.
 */

import Link from "next/link";
import { ArrowUpRight01Icon, NewTwitterIcon } from "hugeicons-react";
import {
  PlayCard,
  primaryButtonClasses,
  secondaryButtonClasses,
} from "@/app/components/play/ui";

const X_URL = "https://x.com/noblocks_xyz";

export const CampaignEnded = () => (
  <div className="mx-auto flex w-full max-w-xl flex-col gap-6 py-6 sm:py-10">
    <div className="space-y-3 text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-lavender-500">
        Noblocks Play
      </p>
      <h1 className="text-2xl font-semibold tracking-tight text-text-body dark:text-white sm:text-3xl">
        This season of Noblocks Play has ended
      </h1>
      <p className="text-sm leading-relaxed text-text-secondary dark:text-white/60 sm:text-base">
        Thanks for playing. Follow us on X for winners and the next campaign.
      </p>
    </div>

    <PlayCard className="space-y-3 sm:p-6">
      <p className="text-sm leading-relaxed text-text-body dark:text-white/80">
        Noblocks Play will be back for more Premier League gameweeks — stay
        tuned.
      </p>
      <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
        <a
          href={X_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`${primaryButtonClasses} inline-flex items-center justify-center gap-2`}
        >
          <NewTwitterIcon className="size-4" />
          Follow on X
          <ArrowUpRight01Icon className="size-4" />
        </a>
        <Link
          href="/"
          className={`${secondaryButtonClasses} inline-flex items-center justify-center gap-2`}
        >
          Back to Noblocks
        </Link>
      </div>
    </PlayCard>
  </div>
);
