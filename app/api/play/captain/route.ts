import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";
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
} from "@/app/lib/fantasy/server";

/**
 * POST /api/play/captain — change captain/vice. Free before lock; during a
 * live round the official §6.2 constraints apply: the incoming (vice-)captain
 * must not have played yet and the outgoing one's match must not be in
 * progress. Changing forfeits the old captain's double.
 */
export const POST = withRateLimit(async (request: NextRequest) => {
  if (!isFantasyEnabled()) return fantasyDisabledResponse();

  try {
    const auth = await getAuthedWallet(request);
    if (!auth) return jsonError("Unauthorized", 401);

    const participant = await getParticipant(auth.walletAddress);
    if (!participant) return jsonError("Join the league first", 403, { code: "NOT_JOINED" });

    const matchday = await getCurrentMatchday();
    if (!matchday) return jsonError("No active matchday", 404);

    const body = await request.json().catch(() => null);
    const captainId = Number(body?.captainId);
    const viceId = Number(body?.viceId);
    if (!Number.isFinite(captainId) || !Number.isFinite(viceId) || captainId === viceId) {
      return jsonError("Provide distinct captainId and viceId", 400);
    }

    const squad = await getSquad(auth.walletAddress, matchday.id);
    if (!squad) return jsonError("Create your squad first", 400, { code: "NO_SQUAD" });

    const xi = squad.players.filter((p) => p.slot <= 11);
    const xiIds = new Set(xi.map((p) => p.player_id));
    if (!xiIds.has(captainId) || !xiIds.has(viceId)) {
      return jsonError("Captain and vice-captain must be in your starting XI", 400);
    }

    if (isMatchdayLocked(matchday)) {
      const [players, lockStates, playerPoints] = await Promise.all([
        getPlayersMap(),
        getTeamLockStates(matchday.id),
        getMatchdayPlayerPoints(matchday.id),
      ]);
      const state = (id: number) => {
        const player = players.get(id);
        return player ? (lockStates.get(player.team_id) ?? "unlocked") : "unlocked";
      };
      const hasPlayed = (id: number) => (playerPoints.get(id)?.minutes ?? 0) > 0;

      const oldCaptain = squad.players.find((p) => p.is_captain)?.player_id;
      const oldVice = squad.players.find((p) => p.is_vice)?.player_id;

      const checks: [number | undefined, number][] = [];
      if (oldCaptain !== captainId) checks.push([oldCaptain, captainId]);
      if (oldVice !== viceId) checks.push([oldVice, viceId]);

      for (const [outgoing, incoming] of checks) {
        if (state(incoming) !== "unlocked" || hasPlayed(incoming)) {
          return jsonError("The new (vice-)captain must not have played yet this round", 403, {
            code: "CAPTAIN_LOCKED",
          });
        }
        if (outgoing != null && state(outgoing) === "locked") {
          return jsonError(
            "You can't change (vice-)captain while their match is in progress",
            403,
            { code: "CAPTAIN_LOCKED" },
          );
        }
      }
    }

    const { error: clearError } = await supabaseAdmin
      .from("fantasy_squad_players")
      .update({ is_captain: false, is_vice: false })
      .eq("squad_id", squad.id);
    if (clearError) throw clearError;
    const { error: captainError } = await supabaseAdmin
      .from("fantasy_squad_players")
      .update({ is_captain: true })
      .eq("squad_id", squad.id)
      .eq("player_id", captainId);
    if (captainError) throw captainError;
    const { error: viceError } = await supabaseAdmin
      .from("fantasy_squad_players")
      .update({ is_vice: true })
      .eq("squad_id", squad.id)
      .eq("player_id", viceId);
    if (viceError) throw viceError;

    return jsonOk({ captainId, viceId });
  } catch (error) {
    console.error("[play] captain change failed:", error);
    return jsonError("Failed to update captaincy", 500);
  }
});
