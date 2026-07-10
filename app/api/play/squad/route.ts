import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";
import { trackBusinessEvent } from "@/app/lib/server-analytics";
import { getFantasySettings, matchdayLabel } from "@/app/lib/fantasy/settings";
import { validateSquad } from "@/app/lib/fantasy/validation";
import type { SquadSelection } from "@/app/lib/fantasy/types";
import {
  fantasyDisabledResponse,
  getAuthedWallet,
  getCurrentMatchday,
  getMatchdayPlayerPoints,
  getParticipant,
  getPlayersMap,
  getSquad,
  getTeamLockStates,
  isFantasyEnabled,
  isMatchdayLocked,
  jsonError,
  jsonOk,
  type SquadRow,
} from "@/app/lib/fantasy/server";

/** GET /api/play/squad — own squad for the current matchday + live points. */
export const GET = withRateLimit(async (request: NextRequest) => {
  if (!isFantasyEnabled()) return fantasyDisabledResponse();

  try {
    const auth = await getAuthedWallet(request);
    if (!auth) return jsonError("Unauthorized", 401);

    const participant = await getParticipant(auth.walletAddress);
    if (!participant) return jsonError("Join the league first", 403, { code: "NOT_JOINED" });

    const matchday = await getCurrentMatchday();
    if (!matchday) return jsonError("No active matchday", 404);

    const [
      squad,
      lockStates,
      playerPoints,
      settings,
      { data: matchdayScores },
      { data: profile },
    ] = await Promise.all([
      getSquad(auth.walletAddress, matchday.id),
      getTeamLockStates(matchday.id),
      getMatchdayPlayerPoints(matchday.id),
      getFantasySettings(),
      supabaseAdmin
        .from("fantasy_matchday_scores")
        .select("matchday_id, points")
        .eq("wallet_address", auth.walletAddress),
      supabaseAdmin
        .from("user_kyc_profiles")
        .select("username")
        .eq("wallet_address", auth.walletAddress)
        .maybeSingle(),
    ]);

    const players = await getPlayersMap();

    return jsonOk({
      matchday,
      locked: isMatchdayLocked(matchday),
      squad: squad
        ? {
            ...squad,
            players: squad.players.map((entry) => {
              const player = players.get(entry.player_id);
              return {
                ...entry,
                player,
                lock_state: player ? (lockStates.get(player.team_id) ?? "unlocked") : "unlocked",
                live: playerPoints.get(entry.player_id) ?? { points: 0, minutes: 0 },
              };
            }),
          }
        : null,
      free_transfers: settings.free_transfers[matchdayLabel(matchday.id)] ?? 0,
      total_points: participant.total_points,
      username: (profile?.username as string | null) ?? null,
      matchday_scores: (matchdayScores ?? []).map((s) => ({
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
 * PUT /api/play/squad — create or update the squad for the current matchday.
 *
 * Before the round locks: initial squads (is_initial) can be rebuilt freely;
 * rolled-over squads may only rearrange lineup/captaincy here — composition
 * changes go through /api/play/transfers so the −3 overage cost applies.
 *
 * After lock (live round): manual subs under the rolling lockout (TRD §6.3) —
 * incoming players must not have kicked off; outgoing players must not be
 * mid-match. Captain changes follow §6.2 (new captain not yet played, old
 * captain's match not in progress).
 */
export const PUT = withRateLimit(async (request: NextRequest) => {
  if (!isFantasyEnabled()) return fantasyDisabledResponse();

  try {
    const auth = await getAuthedWallet(request);
    if (!auth) return jsonError("Unauthorized", 401);

    const participant = await getParticipant(auth.walletAddress);
    if (!participant) return jsonError("Join the league first", 403, { code: "NOT_JOINED" });
    if (participant.disqualified) return jsonError("Account disqualified", 403);

    const matchday = await getCurrentMatchday();
    if (!matchday) return jsonError("No active matchday", 404);

    const body = (await request.json().catch(() => null)) as PutBody | null;
    if (!body) return jsonError("Invalid request body", 400);
    const selection = selectionFromBody(body);

    const [settings, players, existing] = await Promise.all([
      getFantasySettings(),
      getPlayersMap(),
      getSquad(auth.walletAddress, matchday.id),
    ]);

    // Structural validation always applies (deadlines enforced server-side —
    // never trust client clocks, TRD §3).
    const validation = validateSquad({
      selection,
      players,
      settings,
      matchdayLabel: matchdayLabel(matchday.id),
    });
    if (!validation.ok) {
      return jsonError("Invalid squad", 400, { errors: validation.errors });
    }

    const locked = isMatchdayLocked(matchday);
    const newIds = new Set(selection.players.map((p) => p.playerId));

    if (!existing) {
      // First save — squad creation, only while the round is open.
      if (locked) {
        return jsonError("This round is locked — you can join the next one", 403, {
          code: "ROUND_LOCKED",
        });
      }
      for (const id of newIds) {
        if (!players.get(id)?.is_active) {
          return jsonError("Squad contains players from eliminated teams", 400);
        }
      }
    } else {
      const oldIds = new Set(existing.players.map((p) => p.player_id));
      const compositionChanged =
        newIds.size !== oldIds.size || [...newIds].some((id) => !oldIds.has(id));

      if (!locked) {
        if (compositionChanged && !existing.is_initial) {
          return jsonError("Use transfers to change your squad after your first round", 400, {
            code: "USE_TRANSFERS",
          });
        }
        if (compositionChanged) {
          for (const id of newIds) {
            if (!oldIds.has(id) && !players.get(id)?.is_active) {
              return jsonError("Squad contains players from eliminated teams", 400);
            }
          }
        }
      } else {
        // Live round: same 15 players, rolling lockout on lineup movement.
        if (compositionChanged) {
          return jsonError("Transfers are closed during a live round", 403, {
            code: "ROUND_LOCKED",
          });
        }

        const lockStates = await getTeamLockStates(matchday.id);
        const state = (playerId: number) => {
          const player = players.get(playerId);
          return player ? (lockStates.get(player.team_id) ?? "unlocked") : "unlocked";
        };

        const oldSlots = new Map(existing.players.map((p) => [p.player_id, p.slot]));
        const newSlots = new Map(selection.players.map((p) => [p.playerId, p.slot]));
        for (const [playerId, oldSlot] of oldSlots) {
          const newSlot = newSlots.get(playerId)!;
          const wasXI = oldSlot <= 11;
          const isXI = newSlot <= 11;
          if (wasXI === isXI) continue;
          if (isXI && state(playerId) !== "unlocked") {
            // Covers both "locked while in progress" and "a completed bench
            // player cannot come in" (§6.3).
            return jsonError(
              "A player can only come into your XI before their match kicks off",
              403,
              { code: "PLAYER_LOCKED" },
            );
          }
          // Moving a FINISHED player out is fine: their points are banked by
          // the kickoff snapshot (xi_at_kickoff), not the current slots.
          if (!isXI && state(playerId) === "locked") {
            return jsonError(
              "You can't remove a player while their match is in progress",
              403,
              { code: "PLAYER_LOCKED" },
            );
          }
        }

        // Captain / vice changes during a live round (§6.2).
        const oldCaptain = existing.players.find((p) => p.is_captain)?.player_id;
        const oldVice = existing.players.find((p) => p.is_vice)?.player_id;
        const playerPoints = await getMatchdayPlayerPoints(matchday.id);
        const hasPlayed = (id?: number) =>
          id != null && (playerPoints.get(id)?.minutes ?? 0) > 0;

        if (oldCaptain !== selection.captainId) {
          if (state(selection.captainId) !== "unlocked" || hasPlayed(selection.captainId)) {
            return jsonError("New captain must not have played yet", 403, {
              code: "CAPTAIN_LOCKED",
            });
          }
          if (oldCaptain != null && state(oldCaptain) === "locked") {
            return jsonError(
              "You can't change captain while their match is in progress",
              403,
              { code: "CAPTAIN_LOCKED" },
            );
          }
        }
        if (oldVice !== selection.viceId) {
          if (state(selection.viceId) !== "unlocked" || hasPlayed(selection.viceId)) {
            return jsonError("New vice-captain must not have played yet", 403, {
              code: "CAPTAIN_LOCKED",
            });
          }
          if (oldVice != null && state(oldVice) === "locked") {
            return jsonError(
              "You can't change vice-captain while their match is in progress",
              403,
              { code: "CAPTAIN_LOCKED" },
            );
          }
        }
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
      p_is_initial: true,
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
