"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  Copy01Icon,
  LinkSquare01Icon,
  Share08Icon,
  UserGroupIcon,
} from "hugeicons-react";
import { trackEvent } from "@/app/hooks/analytics/client";
import type { LeagueSummary } from "./types";
import {
  leagueJoinUrl,
  leagueShareText,
} from "./league-invite";
import { Chip, PlayCard, secondaryButtonClasses } from "./ui";

const iconBtn =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors";

async function copyText(label: string, text: string) {
  await navigator.clipboard.writeText(text);
  toast.success(`${label} copied`);
}

export function LeagueCard({
  league,
  onLeave,
}: {
  league: LeagueSummary;
  onLeave: (id: string) => void;
}) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const inviteUrl = leagueJoinUrl(league.invite_code);

  const flashCopied = (kind: "code" | "link") => {
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 2000);
  };

  const copyCode = useCallback(async () => {
    await copyText("Invite code", league.invite_code);
    flashCopied("code");
    trackEvent("league_invite_shared", { action: "copy_code", league_id: league.id });
  }, [league.id, league.invite_code]);

  const copyLink = useCallback(async () => {
    await copyText("Invite link", inviteUrl);
    flashCopied("link");
    trackEvent("league_invite_shared", { action: "copy_link", league_id: league.id });
  }, [inviteUrl, league.id]);

  const shareInvite = useCallback(async () => {
    const text = leagueShareText(league.name, league.invite_code);
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${league.name} — Noblocks Play`,
          text,
          url: inviteUrl,
        });
      } else {
        await copyText("Invite message", text);
      }
      trackEvent("league_invite_shared", { action: "share", league_id: league.id });
    } catch {
      // dismissed share sheet
    }
  }, [inviteUrl, league.invite_code, league.id, league.name]);

  return (
    <PlayCard className="overflow-hidden p-0">
      <div className="border-b border-border-light px-4 py-4 dark:border-white/10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <UserGroupIcon className="size-4 shrink-0 text-lavender-500" />
              <h2 className="truncate text-base font-semibold text-text-body dark:text-white">
                {league.name}
              </h2>
            </div>
            <p className="mt-1 text-xs text-text-secondary dark:text-white/50">
              {league.member_count} member{league.member_count === 1 ? "" : "s"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onLeave(league.id)}
            className={`${secondaryButtonClasses} shrink-0 px-3 py-2 text-xs`}
          >
            Leave
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-lavender-200/80 bg-gradient-to-br from-lavender-50/90 to-white p-3 dark:border-lavender-500/20 dark:from-lavender-500/10 dark:to-white/[0.02]">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-lavender-700 dark:text-lavender-300">
            Invite friends
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-white px-3 py-2 font-mono text-sm font-bold tracking-widest text-text-body shadow-sm dark:bg-black/40 dark:text-white">
              {league.invite_code}
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => void copyCode()}
                className={`${iconBtn} bg-white text-text-body shadow-sm hover:bg-accent-gray dark:bg-white/10 dark:text-white dark:hover:bg-white/15`}
              >
                <Copy01Icon className="size-3.5" />
                {copied === "code" ? "Copied" : "Code"}
              </button>
              <button
                type="button"
                onClick={() => void copyLink()}
                className={`${iconBtn} bg-white text-text-body shadow-sm hover:bg-accent-gray dark:bg-white/10 dark:text-white dark:hover:bg-white/15`}
              >
                <LinkSquare01Icon className="size-3.5" />
                {copied === "link" ? "Copied" : "Link"}
              </button>
              <button
                type="button"
                onClick={() => void shareInvite()}
                className={`${iconBtn} bg-lavender-500 text-white hover:bg-lavender-600`}
              >
                <Share08Icon className="size-3.5" />
                Share
              </button>
            </div>
          </div>
          <p className="mt-2 truncate text-[11px] text-text-secondary dark:text-white/40">
            {inviteUrl.replace(/^https?:\/\//, "")}
          </p>
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-light text-[11px] uppercase tracking-wide text-text-secondary dark:border-white/10 dark:text-white/40">
                <th className="pb-2 pr-2 font-medium">#</th>
                <th className="pb-2 pr-2 font-medium">Manager</th>
                <th className="pb-2 pr-2 text-right font-medium">Pts</th>
                <th className="pb-2 text-right font-medium">Xfers</th>
              </tr>
            </thead>
            <tbody>
              {league.standings.map((row) => (
                <tr
                  key={row.wallet_address}
                  className={
                    row.is_me
                      ? "bg-lavender-50/80 dark:bg-lavender-500/10"
                      : "border-b border-border-light/60 last:border-0 dark:border-white/5"
                  }
                >
                  <td className="py-2.5 pr-2 tabular-nums text-text-secondary dark:text-white/70">
                    {row.rank}
                  </td>
                  <td className="py-2.5 pr-2 font-medium text-text-body dark:text-white">
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {row.username ?? "—"}
                      {row.is_me && <Chip tone="lavender">You</Chip>}
                    </span>
                  </td>
                  <td className="py-2.5 pr-2 text-right tabular-nums font-semibold">
                    {row.points}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-text-secondary dark:text-white/50">
                    {row.transfers}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-text-secondary dark:text-white/40">
          Points count from the gameweek you joined. Ties break by fewest transfers.
        </p>
      </div>
    </PlayCard>
  );
}
