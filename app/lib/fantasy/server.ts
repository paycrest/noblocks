import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../supabase";
import config from "../config";
import { getPrivyUserIdFromRequest, getWalletAddressFromPrivyUserId } from "../privy";
import { LIVE_STATUSES, FINISHED_STATUSES } from "./provider";
import type { FantasyPlayer, MatchdayStatus } from "./types";

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

/**
 * The matchday all squad interactions target: the lowest non-final matchday.
 * Before lock_at it's "open" (squad building / transfers); after lock it's the
 * live round (rolling-lockout lineup/captain changes only).
 */
export async function getCurrentMatchday(): Promise<MatchdayRow | null> {
  const { data, error } = await supabaseAdmin
    .from("fantasy_matchdays")
    .select("id, label, round, display_name, lock_at, status")
    .neq("status", "final")
    .order("id", { ascending: true })
    .limit(1);
  if (error) throw error;
  return (data?.[0] as MatchdayRow) ?? null;
}

export async function getMatchdays(): Promise<MatchdayRow[]> {
  const { data, error } = await supabaseAdmin
    .from("fantasy_matchdays")
    .select("id, label, round, display_name, lock_at, status")
    .order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MatchdayRow[];
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

export async function getPlayersMap(): Promise<Map<number, FantasyPlayer>> {
  const { data, error } = await supabaseAdmin
    .from("fantasy_players")
    .select("provider_player_id, team_id, name, nation, position, price, photo_url, is_active");
  if (error) throw error;
  return new Map(
    ((data ?? []) as FantasyPlayer[]).map((p) => [Number(p.provider_player_id), p]),
  );
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

/** Sum of live/final points per player for a matchday (from stats upserts). */
export async function getMatchdayPlayerPoints(
  matchdayId: number,
): Promise<Map<number, { points: number; minutes: number }>> {
  const { data: fixtures, error: fixturesError } = await supabaseAdmin
    .from("fantasy_fixtures")
    .select("provider_fixture_id")
    .eq("matchday_id", matchdayId);
  if (fixturesError) throw fixturesError;
  const fixtureIds = (fixtures ?? []).map((f) => Number(f.provider_fixture_id));
  if (fixtureIds.length === 0) return new Map();

  const { data, error } = await supabaseAdmin
    .from("fantasy_player_match_stats")
    .select("player_id, points, stats")
    .in("provider_fixture_id", fixtureIds);
  if (error) throw error;

  const totals = new Map<number, { points: number; minutes: number }>();
  for (const row of data ?? []) {
    const id = Number(row.player_id);
    const prev = totals.get(id) ?? { points: 0, minutes: 0 };
    const minutes = Number((row.stats as { minutes?: number })?.minutes ?? 0);
    totals.set(id, { points: prev.points + Number(row.points), minutes: prev.minutes + minutes });
  }
  return totals;
}
