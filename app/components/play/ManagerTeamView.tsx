"use client";

/**
 * Read-only view of another manager's team (/play/manager/[username]):
 * the latest locked round's XI + bench with effective points (captain
 * double included). Reuses the same pitch the owner sees on /play/team.
 *
 * Final auto-subs move promoted players onto the pitch and replaced starters
 * to the vacated bench slots. SUB ON / SUB OFF rings remain visible.
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
  const players = [...(team?.players ?? [])].sort(
    (a, b) => a.display_slot - b.display_slot,
  );
  for (const p of players) {
    if (p.display_slot <= 11) rows[p.position].push(toSlotView(p));
    else bench.push(toSlotView(p));
  }

  const subsOn = (team?.players ?? []).filter((p) => p.sub_state === "in").length;
  const benchNote =
    subsOn > 0
      ? `${subsOn} auto-sub${subsOn === 1 ? "" : "s"} applied`
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
            {/* The hit is already inside team.points, so the cards on the
                pitch sum to team.points + this. Shown so that still adds up. */}
            {team.transfer_points_deduction > 0 && (
              <Chip tone="red">
                −{team.transfer_points_deduction} pts transfers
              </Chip>
            )}
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
