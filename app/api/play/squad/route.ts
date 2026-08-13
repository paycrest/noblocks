import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimitAndAnalytics } from "@/app/lib/analytics-middleware";
import { trackBusinessEvent } from "@/app/lib/server-analytics";
import { getFantasySettings } from "@/app/lib/fantasy/settings";
import { getPlayersMap } from "@/app/lib/fantasy/players";
import { validateSquad } from "@/app/lib/fantasy/validation";
import type { SquadSelection } from "@/app/lib/fantasy/types";
import { hasActiveFixtures } from "@/app/lib/fantasy/fixture-activity";
import {
  fantasyDisabledResponse,
  getAuthedWallet,
  getCurrentMatchday,
  getMatchdayPlayerPoints,
  getParticipant,
  getSquad,
  isFantasyEnabled,
  isMatchdayLocked,
  jsonError,
  jsonOk,
  type SquadRow,
} from "@/app/lib/fantasy/server";

/** GET /api/play/squad — own squad for the current matchday + live points. */
export const GET = withRateLimitAndAnalytics(async (request: NextRequest) => {
  if (!isFantasyEnabled()) return fantasyDisabledResponse();

  try {
    const auth = await getAuthedWallet(request);
    if (!auth) return jsonError("Unauthorized", 401);

    const participant = await getParticipant(auth.walletAddress);
    if (!participant) return jsonError("Join the league first", 403, { code: "NOT_JOINED" });

    const matchday = await getCurrentMatchday();
    if (!matchday) return jsonError("No active matchday", 404);

    const settings = await getFantasySettings();
    const [
      squad,
      playerPoints,
      matchdayScoresResult,
      profileResult,
      fixturesResult,
    ] = await Promise.all([
      getSquad(auth.walletAddress, matchday.id),
      getMatchdayPlayerPoints(matchday.id),
      supabaseAdmin
        .from("fantasy_matchday_scores")
        .select("matchday_id, points")
        .eq("wallet_address", auth.walletAddress)
        .gte("matchday_id", settings.season_matchday_min)
        .lte("matchday_id", settings.season_matchday_max),
      supabaseAdmin
        .from("user_kyc_profiles")
        .select("username")
        .eq("wallet_address", auth.walletAddress)
        .maybeSingle(),
      supabaseAdmin
        .from("fantasy_fixtures")
        .select("status, kickoff")
        .eq("matchday_id", matchday.id),
    ]);

    for (const result of [matchdayScoresResult, profileResult, fixturesResult]) {
      if (result.error) throw result.error;
    }

    const players = await getPlayersMap();

    return jsonOk({
      matchday,
      locked: isMatchdayLocked(matchday),
      game_active: hasActiveFixtures(fixturesResult.data ?? []),
      squad: squad
        ? {
            ...squad,
            players: squad.players.map((entry) => {
              const player = players.get(entry.player_id);
              return {
                ...entry,
                player: player
                  ? {
                      ...player,
                      photo_url: settings.photos_enabled
                        ? player.photo_url
                        : null,
                    }
                  : undefined,
                lock_state: "unlocked" as const,
                live: playerPoints.get(entry.player_id) ?? {
                  points: 0,
                  minutes: 0,
                  yellowCards: 0,
                  redCards: 0,
                },
              };
            }),
          }
        : null,
      free_transfers: squad?.free_transfers_remaining ?? 1,
      free_transfers_max: settings.free_transfers_max,
      club_cap: settings.club_cap,
      photos_enabled: settings.photos_enabled,
      total_points: participant.total_points,
      username: (profileResult.data?.username as string | null) ?? null,
      matchday_scores: (matchdayScoresResult.data ?? []).map((s) => ({
        matchday_id: Number(s.matchday_id),
        points: Number(s.points),
      })),
    });
  } catch (error) {
    console.error("[play] squad fetch failed:", error);
    return jsonError("Failed to load squad", 500);
  }
});

interface PutBody {
  players: { playerId: number; slot: number }[];
  captainId: number;
  viceId: number;
}

const selectionFromBody = (body: PutBody): SquadSelection => ({
  players: (body.players ?? []).map((p) => ({
    playerId: Number(p.playerId),
    slot: Number(p.slot),
  })),
  captainId: Number(body.captainId),
  viceId: Number(body.viceId),
});

/**
 * PUT /api/play/squad — create or update the squad for the current gameweek.
 * After lock_at: no edits (single deadline). Holding inactive players OK;
 * transferring in inactive players blocked.
 */
export const PUT = withRateLimitAndAnalytics(async (request: NextRequest) => {
  if (!isFantasyEnabled()) return fantasyDisabledResponse();

  try {
    const auth = await getAuthedWallet(request);
    if (!auth) return jsonError("Unauthorized", 401);

    const participant = await getParticipant(auth.walletAddress);
    if (!participant) return jsonError("Join the league first", 403, { code: "NOT_JOINED" });
    if (participant.disqualified) return jsonError("Account disqualified", 403);

    const matchday = await getCurrentMatchday();
    if (!matchday) return jsonError("No active gameweek", 404);

    const body = (await request.json().catch(() => null)) as PutBody | null;
    if (!body) return jsonError("Invalid request body", 400);
    const selection = selectionFromBody(body);

    const [settings, players, existing] = await Promise.all([
      getFantasySettings(),
      getPlayersMap(),
      getSquad(auth.walletAddress, matchday.id),
    ]);

    const validation = validateSquad({ selection, players, settings });
    if (!validation.ok) {
      return jsonError("Invalid squad", 400, { errors: validation.errors });
    }

    const locked = isMatchdayLocked(matchday);
    if (locked) {
      return jsonError("This gameweek is locked — changes are closed", 403, {
        code: "ROUND_LOCKED",
      });
    }

    const newIds = new Set(selection.players.map((p) => p.playerId));
    const oldIds = new Set((existing?.players ?? []).map((p) => p.player_id));
    const compositionChanged =
      !existing ||
      newIds.size !== oldIds.size ||
      [...newIds].some((id) => !oldIds.has(id));

    if (existing && compositionChanged && !existing.is_initial) {
      return jsonError("Use transfers to change your squad after your first deadline", 400, {
        code: "USE_TRANSFERS",
      });
    }

    for (const id of newIds) {
      const held = oldIds.has(id);
      if (!held && !players.get(id)?.is_active) {
        return jsonError("That player is not available to buy", 400);
      }
    }

    const budgetSpent = selection.players.reduce(
      (sum, { playerId }) => sum + Number(players.get(playerId)?.price ?? 0),
      0,
    );

    // Upsert squad row + replace composition atomically via a single RPC
    // call, so a mid-save failure can't leave the squad empty.
    const { data: squadId, error: saveError } = await supabaseAdmin.rpc("fantasy_save_squad", {
      p_squad_id: existing?.id ?? null,
      p_wallet_address: auth.walletAddress,
      p_matchday_id: matchday.id,
      p_budget_spent: budgetSpent,
      p_is_initial: existing?.is_initial ?? true,
      p_players: selection.players.map(({ playerId, slot }) => ({
        playerId,
        slot,
        isCaptain: playerId === selection.captainId,
        isVice: playerId === selection.viceId,
      })),
    });
    if (saveError) throw saveError;

    trackBusinessEvent("Fantasy Squad Saved", {
      wallet_address: auth.walletAddress,
      matchday_id: matchday.id,
      budget_spent: budgetSpent,
      live_round: locked,
    });

    const saved = (await getSquad(auth.walletAddress, matchday.id)) as SquadRow;
    return jsonOk({ squad: saved });
  } catch (error) {
    console.error("[play] squad save failed:", error);
    return jsonError("Failed to save squad", 500);
  }
});
