"use client";

/**
 * Leaderboard table rows: rank, movement arrow, username, points and the
 * qualification badge. Other players' referral counts are never shown
 * (PRD §7.3) — the in-progress tooltip carries a count only for the
 * viewer's own row. Rows link to the manager's public team view.
 */

import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Award01Icon,
  ChampionIcon,
  LaurelWreath01Icon,
} from "hugeicons-react";
import type { LeaderboardRowData } from "./types";

const managerHref = (username: string) =>
  `/play/manager/${encodeURIComponent(username)}`;

const Movement = ({ value }: { value: number }) => {
  if (value > 0) {
    return (
      <span
        className="inline-flex items-center text-xs font-semibold text-emerald-500"
        aria-label={`Up ${value}`}
      >
        <ArrowUp01Icon className="size-3.5" />
        {value}
      </span>
    );
  }
  if (value < 0) {
    return (
      <span
        className="inline-flex items-center text-xs font-semibold text-accent-red"
        aria-label={`Down ${-value}`}
      >
        <ArrowDown01Icon className="size-3.5" />
        {-value}
      </span>
    );
  }
  return (
    <span
      className="text-xs text-text-disabled dark:text-white/30"
      aria-label="No rank movement"
      title="No rank movement since the last round"
    >
      —
    </span>
  );
};

const Badge = ({
  row,
  selfProgress,
}: {
  row: LeaderboardRowData;
  selfProgress?: { activated: number; required: number };
}) => {
  if (row.badge === "qualified") {
    return (
      <span title="Qualified for the giveaway">
        <ChampionIcon className="size-4 text-yellow-primary" />
      </span>
    );
  }
  if (row.badge === "opted_out") {
    return (
      <span title="Playing for bragging rights">
        <LaurelWreath01Icon className="size-4 text-text-disabled dark:text-white/30" />
      </span>
    );
  }
  // in_progress — hollow badge; the activated count is private, so the
  // tooltip only says more on the viewer's own row.
  const title =
    row.is_me && selfProgress
      ? `${selfProgress.activated} of ${selfProgress.required} referrals activated`
      : "Qualification in progress";
  return (
    <span title={title}>
      <Award01Icon className="size-4 text-text-secondary opacity-50 dark:text-white/40" />
    </span>
  );
};

export const LeaderboardTable = ({
  rows,
  selfProgress,
  compact = false,
}: {
  rows: LeaderboardRowData[];
  /** Own referral progress (rewards endpoint) for the self-row tooltip. */
  selfProgress?: { activated: number; required: number };
  compact?: boolean;
}) => {
  const router = useRouter();

  return (
  <div className="overflow-x-auto rounded-2xl border border-border-light dark:border-white/10">
    <table className="w-full min-w-[20rem] text-left text-sm">
      <thead>
        <tr className="border-b border-border-light text-xs uppercase tracking-wide text-text-secondary dark:border-white/10 dark:text-white/40">
          <th className="px-4 py-3 font-medium">#</th>
          <th className="px-2 py-3 font-medium" aria-label="Movement" />
          <th className="px-2 py-3 font-medium">Manager</th>
          <th className="px-2 py-3 text-right font-medium">Pts</th>
          <th className="px-4 py-3 text-right font-medium" aria-label="Badge" />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={`${row.rank}-${row.username ?? "anon"}`}
            id={row.is_me ? "leaderboard-self-row" : undefined}
            // Whole row navigates to the manager's public team; the username
            // is also a real link for keyboard/screen-reader users.
            onClick={
              row.username
                ? () => router.push(managerHref(row.username!))
                : undefined
            }
            className={`border-b border-border-light last:border-0 dark:border-white/5 ${
              row.username ? "cursor-pointer" : ""
            } ${
              row.is_me
                ? "bg-lavender-50 dark:bg-lavender-500/10"
                : compact
                  ? ""
                  : "hover:bg-background-neutral dark:hover:bg-white/[.03]"
            }`}
          >
            <td className="px-4 py-3 font-semibold tabular-nums text-text-body dark:text-white">
              {row.rank}
            </td>
            <td className="px-2 py-3">
              <Movement value={row.movement} />
            </td>
            <td className="max-w-[10rem] truncate px-2 py-3 font-medium text-text-body dark:text-white sm:max-w-none">
              {row.username ? (
                <Link
                  href={managerHref(row.username)}
                  onClick={(e) => e.stopPropagation()}
                  className="hover:underline"
                >
                  {row.username}
                </Link>
              ) : (
                "—"
              )}
              {row.is_me && (
                <span className="ml-1.5 rounded-full bg-lavender-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  You
                </span>
              )}
            </td>
            <td className="px-2 py-3 text-right font-semibold tabular-nums text-text-body dark:text-white">
              {row.total_points}
            </td>
            <td className="px-4 py-3 text-right">
              <span className="inline-flex justify-end">
                <Badge row={row} selfProgress={selfProgress} />
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
  );
};
