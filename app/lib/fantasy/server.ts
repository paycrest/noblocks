import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../supabase";
import config from "../config";
import { getPrivyUserIdFromRequest, getWalletAddressFromPrivyUserId } from "../privy";
import { getFantasySettings } from "./settings";
import { getPlayersMap } from "./players";
import { fetchAll } from "./pagination";
import { LIVE_STATUSES, FINISHED_STATUSES } from "./provider";
import { applyAutoSubs } from "./autosubs";
import { hasPlayed, type SquadPlayerRow } from "./scoring";
import type {
  FantasySettings,
  MatchdayStatus,
  Position,
  PublicManagerTeam,
} from "./types";

/** Shared helpers for /api/play/* route handlers and the scoring worker. */

export const fantasyDisabledResponse = () =>
  NextResponse.json(
    { success: false, error: "Noblocks Play is not available" },
    { status: 404 },
  );

export const isFantasyEnabled = () => config.fantasyEnabled;

export const jsonOk = (data: unknown, init?: ResponseInit) =>
  NextResponse.json({ success: true, data }, init);

export const jsonError = (error: string, status: number, extra?: Record<string, unknown>) =>
  NextResponse.json({ success: false, error, ...extra }, { status });

/**
 * Resolve the authenticated wallet. Routes matched by the middleware get
 * x-user-id injected; direct calls fall back to Bearer-token verification
 * (same pattern as /api/referral/referral-data).
 */
export async function getAuthedWallet(
  request: NextRequest,
): Promise<{ userId: string; walletAddress: string } | null> {
  const userId = await getPrivyUserIdFromRequest(request);
  if (!userId) return null;
  const walletAddress = await getWalletAddressFromPrivyUserId(userId);
  return { userId, walletAddress: walletAddress.toLowerCase() };
}

export interface MatchdayRow {
  id: number;
  label: string;
  round: string;
  display_name: string;
  lock_at: string;
  status: MatchdayStatus;
}

async function seasonBounds(
  settings?: FantasySettings,
): Promise<{ min: number; max: number }> {
  const s = settings ?? (await getFantasySettings());
  return { min: s.season_matchday_min, max: s.season_matchday_max };
}

/** Season-scoped matchdays only (EPL 101–138). Never returns WC rows. */
export async function getMatchdays(): Promise<MatchdayRow[]> {
  const { min, max } = await seasonBounds();
  const { data, error } = await supabaseAdmin
    .from("fantasy_matchdays")
    .select("id, label, round, display_name, lock_at, status")
    .gte("id", min)
    .lte("id", max)
    .order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MatchdayRow[];
}

/**
 * Lowest non-final matchday in the current season.
 * Before lock_at: open for squad/transfers; after: locked (no mid-GW edits).
 */
export async function getCurrentMatchday(): Promise<MatchdayRow | null> {
  const { min, max } = await seasonBounds();
  const { data, error } = await supabaseAdmin
    .from("fantasy_matchdays")
    .select("id, label, round, display_name, lock_at, status")
    .gte("id", min)
    .lte("id", max)
    .neq("status", "final")
    .order("id", { ascending: true })
    .limit(1);
  if (error) throw error;
  return (data?.[0] as MatchdayRow) ?? null;
}

/** Previous / next row in a season-ordered list — never id±1 arithmetic. */
export function previousMatchday(
  matchdays: MatchdayRow[],
  currentId: number,
): MatchdayRow | null {
  const idx = matchdays.findIndex((m) => m.id === currentId);
  if (idx <= 0) return null;
  return matchdays[idx - 1] ?? null;
}

export function nextMatchday(
  matchdays: MatchdayRow[],
  currentId: number,
): MatchdayRow | null {
  const idx = matchdays.findIndex((m) => m.id === currentId);
  if (idx < 0 || idx >= matchdays.length - 1) return null;
  return matchdays[idx + 1] ?? null;
}

export const isMatchdayLocked = (matchday: MatchdayRow) =>
  Date.now() >= new Date(matchday.lock_at).getTime();

export async function getParticipant(walletAddress: string) {
  const { data, error } = await supabaseAdmin
    .from("fantasy_participants")
    .select(
      "wallet_address, joined_at, terms_accepted_at, giveaway_opt_in, total_points, current_rank, previous_rank, disqualified",
    )
    .eq("wallet_address", walletAddress)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface SquadRow {
  id: string;
  wallet_address: string;
  matchday_id: number;
  budget_spent: number;
  free_transfers_remaining: number;
  transfer_points_deduction: number;
  is_initial: boolean;
  players: {
    player_id: number;
    slot: number;
    is_captain: boolean;
    is_vice: boolean;
  }[];
}

export async function getSquad(
  walletAddress: string,
  matchdayId: number,
): Promise<SquadRow | null> {
  const { data, error } = await supabaseAdmin
    .from("fantasy_squads")
    .select(
      "id, wallet_address, matchday_id, budget_spent, free_transfers_remaining, transfer_points_deduction, is_initial, players:fantasy_squad_players(player_id, slot, is_captain, is_vice)",
    )
    .eq("wallet_address", walletAddress)
    .eq("matchday_id", matchdayId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...data,
    players: (data.players ?? []).map((p: Record<string, unknown>) => ({
      player_id: Number(p.player_id),
      slot: Number(p.slot),
      is_captain: Boolean(p.is_captain),
      is_vice: Boolean(p.is_vice),
    })),
  } as SquadRow;
}

/**
 * Per-team fixture state for the current matchday, used by the rolling
 * lockout: a player is LOCKED while their team's fixture is in progress,
 * PLAYED once it has finished, and UNLOCKED before kickoff.
 */
export async function getTeamLockStates(
  matchdayId: number,
): Promise<Map<number, "unlocked" | "locked" | "played">> {
  const { data, error } = await supabaseAdmin
    .from("fantasy_fixtures")
    .select("home_team_id, away_team_id, status, kickoff")
    .eq("matchday_id", matchdayId);
  if (error) throw error;

  const states = new Map<number, "unlocked" | "locked" | "played">();
  for (const fixture of data ?? []) {
    const status = fixture.status as string;
    const kickedOff = Date.now() >= new Date(fixture.kickoff as string).getTime();
    const state = FINISHED_STATUSES.has(status)
      ? "played"
      : LIVE_STATUSES.has(status) || (kickedOff && status !== "NS" && status !== "TBD")
        ? "locked"
        : kickedOff
          ? "locked" // kickoff time passed but provider hasn't flipped status yet — fail safe
          : "unlocked";
    states.set(Number(fixture.home_team_id), state);
    states.set(Number(fixture.away_team_id), state);
  }
  return states;
}

/**
 * Public view of a manager's team (leaderboard drill-in, share links, OG
 * cards). Privacy: only the most recent LOCKED matchday's squad is exposed —
 * picks for a round that is still open never leak.
 */
export async function getPublicManagerTeam(
  usernameRaw: string,
): Promise<PublicManagerTeam | null> {
  const username = usernameRaw.trim();
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return null;

  // ilike with escaped `_` (a LIKE wildcard) = case-insensitive equality.
  const { data: row, error } = await supabaseAdmin
    .from("fantasy_leaderboard")
    .select("wallet_address, username, total_points, rank, badge")
    .ilike("username", username.replace(/_/g, "\\_"))
    .maybeSingle();
  if (error) throw error;
  if (!row?.username) return null;

  const { count: activatedReferrals, error: refCountError } = await supabaseAdmin
    .from("referrals")
    .select("*", { count: "exact", head: true })
    .eq("referrer_wallet_address", row.wallet_address);
  if (refCountError) throw refCountError;

  const [matchdays, settings, bounds] = await Promise.all([
    getMatchdays(),
    getFantasySettings(),
    seasonBounds(),
  ]);
  const { min: seasonMin } = bounds;
  const current =
    matchdays.find((md) => md.status !== "final") ??
    matchdays[matchdays.length - 1];
  const prev = current ? previousMatchday(matchdays, current.id) : null;
  const ceilingId = current
    ? isMatchdayLocked(current)
      ? current.id
      : prev?.id ?? null
    : null;

  let team: PublicManagerTeam["team"] = null;
  if (ceilingId != null) {
    const { data: squadRow, error: squadError } = await supabaseAdmin
      .from("fantasy_squads")
      .select(
        "matchday_id, players:fantasy_squad_players(player_id, slot, is_captain, is_vice)",
      )
      .eq("wallet_address", row.wallet_address)
      .gte("matchday_id", seasonMin)
      .lte("matchday_id", ceilingId)
      .order("matchday_id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (squadError) throw squadError;

    if (squadRow) {
      const matchdayId = Number(squadRow.matchday_id);
      const matchday = matchdays.find((md) => md.id === matchdayId)!;
      const [players, playerPoints, scoreResult] = await Promise.all([
        getPlayersMap(),
        getMatchdayPlayerPoints(matchdayId),
        supabaseAdmin
          .from("fantasy_matchday_scores")
          .select("points")
          .eq("wallet_address", row.wallet_address)
          .eq("matchday_id", matchdayId)
          .maybeSingle(),
      ]);
      if (scoreResult.error) throw scoreResult.error;
      const score = scoreResult.data;

      const entries = (squadRow.players ?? []).map((p) => ({
        player_id: Number(p.player_id),
        slot: Number(p.slot),
        is_captain: Boolean(p.is_captain),
        is_vice: Boolean(p.is_vice),
      }));
      const live = (id: number) =>
        playerPoints.get(id) ?? { points: 0, minutes: 0, yellowCards: 0, redCards: 0 };
      const squadRows: SquadPlayerRow[] = entries.map((entry) => ({
        playerId: entry.player_id,
        slot: entry.slot,
        isCaptain: entry.is_captain,
        isVice: entry.is_vice,
        position: players.get(entry.player_id)?.position ?? ("MID" as Position),
      }));
      const played = (id: number) => hasPlayed(live(id));
      const scoringXi = applyAutoSubs(squadRows, played);
      const scoringIds = new Set(scoringXi.map((p) => p.playerId));
      const startingXi = squadRows.filter((p) => p.slot <= 11);
      const captain = startingXi.find((p) => p.isCaptain);
      const vice = startingXi.find((p) => p.isVice);
      const doubledId =
        captain && played(captain.playerId)
          ? captain.playerId
          : vice && played(vice.playerId)
            ? vice.playerId
            : null;

      team = {
        matchday: {
          id: matchday.id,
          display_name: matchday.display_name,
          status: matchday.status,
        },
        points: Number(score?.points ?? 0),
        players: entries
          .sort((a, b) => a.slot - b.slot)
          .map((entry) => {
            const player = players.get(entry.player_id);
            const stats = live(entry.player_id);
            const earnsPoints = scoringIds.has(entry.player_id);
            return {
              ...entry,
              name: player?.name ?? "Unknown",
              position: player?.position ?? ("MID" as Position),
              nation: player?.nation ?? "",
              team_id: Number(player?.team_id ?? 0),
              // Prefer stylized kits in UI; never expose provider headshots
              // until photos_enabled is licensed.
              photo_url: settings.photos_enabled
                ? (player?.photo_url ?? null)
                : null,
              points: earnsPoints
                ? stats.points * (entry.player_id === doubledId ? 2 : 1)
                : 0,
              minutes: stats.minutes,
            };
          }),
      };
    }
  }

  return {
    username: row.username as string,
    rank: row.rank != null ? Number(row.rank) : null,
    total_points: Number(row.total_points),
    activated_referrals: activatedReferrals ?? 0,
    badge: String(row.badge),
    team,
  };
}

/** Sum of live/final points per player for a matchday (from stats upserts). */
export type MatchdayPlayerPoints = Map<
  number,
  { points: number; minutes: number; yellowCards: number; redCards: number }
>;

/**
 * Short TTL, not staleness tolerance: the worker only re-pulls a fixture's
 * stats every STATS_MIN_INTERVAL_MS (90s), while clients poll /api/play/squad
 * every 15s during a live round. Without this, every concurrent viewer issues
 * an identical scan of the gameweek's stats rows. Cached map is read-only.
 */
const MATCHDAY_POINTS_TTL_MS = 10_000;

const matchdayPointsCache = new Map<
  number,
  { points: MatchdayPlayerPoints; expiresAt: number }
>();

export async function getMatchdayPlayerPoints(
  matchdayId: number,
): Promise<MatchdayPlayerPoints> {
  const hit = matchdayPointsCache.get(matchdayId);
  if (hit) {
    if (hit.expiresAt > Date.now()) return hit.points;
    matchdayPointsCache.delete(matchdayId);
  }

  // Stamped after the queries below, not before: measuring the TTL from here
  // would spend part of the window on the round trip that filled it.
  const remember = (points: MatchdayPlayerPoints) => {
    matchdayPointsCache.set(matchdayId, {
      points,
      expiresAt: Date.now() + MATCHDAY_POINTS_TTL_MS,
    });
    return points;
  };

  const { data: fixtures, error: fixturesError } = await supabaseAdmin
    .from("fantasy_fixtures")
    .select("provider_fixture_id")
    .eq("matchday_id", matchdayId);
  if (fixturesError) throw fixturesError;
  const fixtureIds = (fixtures ?? []).map((f) => Number(f.provider_fixture_id));
  // Cached too — an unseeded matchday is polled just as hard as a live one.
  if (fixtureIds.length === 0) return remember(new Map());

  const data = await fetchAll<{
    player_id: number;
    points: number;
    stats: { minutes?: number; yellowCards?: number; redCards?: number } | null;
  }>((from, to) =>
    supabaseAdmin
      .from("fantasy_player_match_stats")
      .select("player_id, points, stats")
      .in("provider_fixture_id", fixtureIds)
      .range(from, to),
  );

  const totals: MatchdayPlayerPoints = new Map();
  for (const row of data) {
    const id = Number(row.player_id);
    const prev = totals.get(id) ?? { points: 0, minutes: 0, yellowCards: 0, redCards: 0 };
    const st = row.stats;
    totals.set(id, {
      points: prev.points + Number(row.points),
      minutes: prev.minutes + Number(st?.minutes ?? 0),
      yellowCards: prev.yellowCards + Number(st?.yellowCards ?? 0),
      redCards: prev.redCards + Number(st?.redCards ?? 0),
    });
  }

  return remember(totals);
}
