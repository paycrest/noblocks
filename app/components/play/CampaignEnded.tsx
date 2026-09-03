"use client";

/**
 * Shown at /play when fantasyCampaignEnded; deep links redirect here.
 * Before PLAY_LAUNCH_AT: countdown. After: season-ended announcement.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight01Icon, Clock01Icon, NewTwitterIcon } from "hugeicons-react";
import { useCountdown } from "./hooks";
import {
  PlayCard,
  primaryButtonClasses,
  secondaryButtonClasses,
} from "@/app/components/play/ui";

const X_URL = "https://x.com/noblocks_xyz";

/** Game opens Wednesday 19 August 2026, 00:00 UK (BST). */
export const PLAY_LAUNCH_AT = "2026-08-19T00:00:00+01:00";

const LAUNCH_LABEL = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/London",
}).format(new Date(PLAY_LAUNCH_AT));

const CountdownUnit = ({
  value,
  label,
}: {
  value: number;
  label: string;
}) => (
  <div className="flex min-w-[4.5rem] flex-col items-center gap-1 rounded-xl bg-background-neutral px-3 py-3 dark:bg-white/5 sm:min-w-[5.5rem] sm:px-4 sm:py-4">
    <span className="text-2xl font-bold tabular-nums tracking-tight text-text-body dark:text-white sm:text-3xl">
      {String(value).padStart(2, "0")}
    </span>
    <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary dark:text-white/40 sm:text-xs">
      {label}
    </span>
  </div>
);

export const CampaignEnded = () => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Null target until mount: useCountdown stays at stable zeros (no Date.now).
  const { days, hours, minutes, seconds, expired } = useCountdown(
    mounted ? PLAY_LAUNCH_AT : null,
  );

  if (mounted && expired) {
    return (
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
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 py-6 sm:py-10">
      <div className="space-y-3 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-lavender-500">
          Noblocks Play
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-text-body dark:text-white sm:text-3xl">
          Premier League fantasy is almost here
        </h1>
        <p className="text-sm leading-relaxed text-text-secondary dark:text-white/60 sm:text-base">
          Build your squad, climb the leaderboard, and compete with friends in
          mini-leagues. The season kicks off {LAUNCH_LABEL}.
        </p>
      </div>

      <PlayCard className="space-y-5 sm:p-6">
        <div className="flex items-center justify-center gap-2 text-sm font-medium text-lavender-600 dark:text-lavender-400">
          <Clock01Icon className="size-4 shrink-0" />
          Season starts in
        </div>

        <div className="flex justify-center gap-2 sm:gap-3" aria-busy={!mounted}>
          <CountdownUnit value={mounted ? days : 0} label="Days" />
          <CountdownUnit value={mounted ? hours : 0} label="Hours" />
          <CountdownUnit value={mounted ? minutes : 0} label="Mins" />
          <CountdownUnit value={mounted ? seconds : 0} label="Secs" />
        </div>

        <p className="text-center text-sm text-text-secondary dark:text-white/50">
          {LAUNCH_LABEL}
        </p>

        <div className="flex justify-center pt-1">
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
};
