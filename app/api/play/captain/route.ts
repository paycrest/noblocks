import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimitAndAnalytics } from "@/app/lib/analytics-middleware";
import {
  fantasyDisabledResponse,
  getAuthedWallet,
  getCurrentMatchday,
  getParticipant,
  getSquad,
  isFantasyEnabled,
  isMatchdayLocked,
  jsonError,
  jsonOk,
} from "@/app/lib/fantasy/server";

/** POST /api/play/captain — set C/VC before the gameweek deadline. */
export const POST = withRateLimitAndAnalytics(async (request: NextRequest) => {
  if (!isFantasyEnabled()) return fantasyDisabledResponse();

  try {
    const auth = await getAuthedWallet(request);
    if (!auth) return jsonError("Unauthorized", 401);

    const participant = await getParticipant(auth.walletAddress);
    if (!participant) return jsonError("Join the league first", 403, { code: "NOT_JOINED" });

    const matchday = await getCurrentMatchday();
    if (!matchday) return jsonError("No active gameweek", 404);
    if (isMatchdayLocked(matchday)) {
      return jsonError("This gameweek is locked", 403, { code: "ROUND_LOCKED" });
    }

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

    const { error } = await supabaseAdmin.rpc("fantasy_set_captain", {
      p_squad_id: squad.id,
      p_captain_id: captainId,
      p_vice_id: viceId,
    });
    if (error) throw error;

    return jsonOk({ captainId, viceId });
  } catch (error) {
    console.error("[play] captain change failed:", error);
    return jsonError("Failed to set captain", 500);
  }
});
