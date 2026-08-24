"use client";

/**
 * Read-only view of another manager's team (/play/manager/[username]):
 * the latest locked round's XI + bench with effective points (captain
 * double included). Reuses the same pitch the owner sees on /play/team.
 *
 * Players stay in the slot they were picked in. Auto-subs are badged in
 * place (SUB ON / SUB OFF), so a promoted bench player still renders on the
 * bench while carrying the points that count towards the round total.
 */

import Link from "next/link";
import { ArrowLeft01Icon } from "hugeicons-react";
import { PitchView, type SlotView } from "./PitchView";
import { BenchRow } from "./BenchRow";
import type {
  FantasyPlayer,
  Position,
  PublicManagerTeam,
  PublicTeamPlayer,
} from "./types";
import { Chip, secondaryButtonClasses } from "./ui";

/** Minimal FantasyPlayer for the slot card (price/team never shown here). */
const toFantasyPlayer = (p: PublicTeamPlayer): FantasyPlayer => ({
  provider_player_id: p.player_id,
  team_id: p.team_id,
  name: p.name,
  nation: p.nation,
  position: p.position,
  price: 0,
  photo_url: p.photo_url, // null unless photos_enabled; PlayerPhoto falls back to the kit
  is_active: true,
});

const toSlotView = (p: PublicTeamPlayer): SlotView => ({
  key: String(p.player_id),
  player: toFantasyPlayer(p),
  position: p.position,
  isCaptain: p.is_captain,
  isVice: p.is_vice,
  livePoints: p.points,
  subState: p.sub_state,
});

export const ManagerTeamView = ({
  manager,
}: {
  manager: PublicManagerTeam;
}) => {
  const team = manager.team;

  const rows: Record<Position, SlotView[]> = {
    GK: [],
    DEF: [],
    MID: [],
    FWD: [],
  };
  const bench: SlotView[] = [];
  // Players arrive sorted by slot; a single pass keeps the bench in slot
  // order (12–15) while the XI still groups by position via `rows`.
  for (const p of team?.players ?? []) {
    if (p.slot <= 11) rows[p.position].push(toSlotView(p));
    else bench.push(toSlotView(p));
  }

  // Reconciles the header: the round total is the badged-on bench players
  // plus the starters who were not badged off, never the raw pitch row.
  const subsOn = (team?.players ?? []).filter((p) => p.sub_state === "in").length;
  // Auto-subs only settle when the round does: a starter whose fixture has
  // not kicked off yet reads as a blank mid-round, so say "so far" until final.
  const provisional = team != null && team.matchday.status !== "final";
  const benchNote =
    subsOn > 0
      ? `${subsOn} auto-sub${subsOn === 1 ? "" : "s"} counted below${provisional ? " so far" : ""}`
      : team?.matchday.status === "final"
        ? "no auto-subs this round"
        : undefined;

  return (
    <div className="space-y-4 max-lg:pb-10">
      <Link
        href="/play/leaderboard"
        className="inline-flex items-center gap-1 text-sm text-text-secondary transition-colors hover:text-text-body dark:text-white/50 dark:hover:text-white"
      >
        <ArrowLeft01Icon className="size-4" />
        Leaderboard
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-text-body dark:text-white">
          {manager.username}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {manager.rank != null && <Chip>Rank #{manager.rank}</Chip>}
          <Chip>{manager.total_points} pts total</Chip>
        </div>
      </div>

      {team ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Chip>{team.matchday.display_name}</Chip>
            <Chip>{team.points} pts this round</Chip>
          </div>
          <PitchView rows={rows} showPrice={false} onSlotClick={() => {}} />
          {bench.length > 0 && (
            <BenchRow
              slots={bench}
              showPrice={false}
              onSlotClick={() => {}}
              note={benchNote}
            />
          )}
        </>
      ) : (
        <div className="space-y-2 rounded-2xl border border-dashed border-border-light px-6 py-10 text-center dark:border-white/10">
          <p className="text-sm font-semibold text-text-body dark:text-white">
            Squad under wraps
          </p>
          <p className="mx-auto max-w-sm text-sm text-text-secondary dark:text-white/50">
            Teams only become visible once their round locks — check back
            after kickoff.
          </p>
        </div>
      )}

      <Link href="/play/team" className={`${secondaryButtonClasses} inline-flex`}>
        Build your own squad
      </Link>
    </div>
  );
};
