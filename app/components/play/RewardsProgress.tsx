"use client";

/**
 * Referral qualification progress: "x of N activated" with per-referral
 * cumulative-$ progress bars, plus the countdown to the qualification
 * deadline. Activation is CUMULATIVE volume — the copy states it explicitly
 * (stakeholder decision, handoff §2.4).
 */

import { CheckmarkCircle02Icon, Clock01Icon } from "hugeicons-react";
import { useCountdown } from "./hooks";
import type { RewardsResponse } from "./types";
import { Chip, PlayCard } from "./ui";

const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export const RewardsProgress = ({ rewards }: { rewards: RewardsResponse }) => {
  const countdown = useCountdown(rewards.deadline);
  const { required, activated, min_total_usd, referrals } = rewards;

  return (
    <PlayCard className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-text-body dark:text-white">
          Qualification progress
        </h2>
        {rewards.qualified ? (
          <Chip tone="green">
            <CheckmarkCircle02Icon className="size-3.5" />
            Qualified
          </Chip>
        ) : (
          <Chip tone="lavender">
            {activated} of {required} activated
          </Chip>
        )}
      </div>

      {/* Overall dots */}
      <div className="flex gap-2">
        {Array.from({ length: required }).map((_, i) => (
          <div
            key={i}
            className={`h-2 flex-1 rounded-full ${
              i < activated
                ? "bg-emerald-500"
                : "bg-accent-gray dark:bg-white/10"
            }`}
          />
        ))}
      </div>

      <p className="text-xs text-text-secondary dark:text-white/50">
        A referral <span className="font-semibold">activates</span> when your
        friend&apos;s <span className="font-semibold">total</span> completed
        on/off-ramp volume on Noblocks reaches ${min_total_usd} during the
        campaign — cumulative across all their transactions, not a single
        transaction.
      </p>

      {referrals.length === 0 ? (
        <p className="rounded-xl bg-background-neutral px-4 py-4 text-center text-sm text-text-secondary dark:bg-white/5 dark:text-white/50">
          No referrals yet — share your link below to get started.
        </p>
      ) : (
        <ul className="space-y-3">
          {referrals.map((referral) => {
            const pct = Math.min(
              100,
              (referral.total_tx_usd / min_total_usd) * 100,
            );
            return (
              <li key={referral.wallet_short} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-text-body dark:text-white">
                    {referral.wallet_short}
                  </span>
                  <span
                    className={
                      referral.activated
                        ? "font-semibold text-emerald-600 dark:text-emerald-400"
                        : "text-text-secondary dark:text-white/50"
                    }
                  >
                    {referral.activated
                      ? "Activated"
                      : `$${referral.total_tx_usd.toFixed(2)} of $${min_total_usd}`}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-accent-gray dark:bg-white/10">
                  <div
                    className={`h-full rounded-full ${
                      referral.activated ? "bg-emerald-500" : "bg-lavender-500"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-background-neutral px-4 py-3 text-xs text-text-secondary dark:bg-white/5 dark:text-white/50">
        <Clock01Icon className="size-4 shrink-0" />
        {countdown.expired ? (
          <span>The qualification deadline has passed.</span>
        ) : (
          <span>
            Qualification closes in{" "}
            <span className="font-semibold text-text-body dark:text-white">
              {countdown.days}d {countdown.hours}h {countdown.minutes}m
            </span>{" "}
            ({dateFormat.format(new Date(rewards.deadline))})
          </span>
        )}
      </div>
    </PlayCard>
  );
};
