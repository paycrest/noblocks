import { NextRequest } from "next/server";
import { withRateLimitAndAnalytics } from "@/app/lib/analytics-middleware";
import { trackBusinessEvent } from "@/app/lib/server-analytics";
import { joinLeagueByCode } from "@/app/lib/fantasy/leagues";
import {
  fantasyDisabledResponse,
  getAuthedWallet,
  getCurrentMatchday,
  getParticipant,
  isFantasyEnabled,
  jsonError,
  jsonOk,
} from "@/app/lib/fantasy/server";

/** POST /api/play/leagues/join — { code } */
export const POST = withRateLimitAndAnalytics(async (request: NextRequest) => {
  if (!isFantasyEnabled()) return fantasyDisabledResponse();

  try {
    const auth = await getAuthedWallet(request);
    if (!auth) return jsonError("Unauthorized", 401);

    const participant = await getParticipant(auth.walletAddress);
    if (!participant) return jsonError("Join the league first", 403, { code: "NOT_JOINED" });
    if (participant.disqualified) return jsonError("Account disqualified", 403);

    const matchday = await getCurrentMatchday();
    if (!matchday) return jsonError("No active matchday", 404);

    const body = await request.json().catch(() => null);
    const code = typeof body?.code === "string" ? body.code : "";
    if (!code.trim()) return jsonError("Provide an invite code", 400);

    try {
      const league = await joinLeagueByCode({
        code,
        wallet: auth.walletAddress,
        joinedGameweek: matchday.id,
      });
      trackBusinessEvent("Fantasy League Joined", {
        wallet_address: auth.walletAddress,
        league_id: league.id,
      });
      return jsonOk({ league });
    } catch (e) {
      if (e instanceof Error) {
        if (e.message === "NOT_FOUND") return jsonError("Invite code not found", 404);
        if (e.message === "ALREADY_MEMBER") {
          return jsonError("You are already in this league", 409, { code: "ALREADY_MEMBER" });
        }
        if (e.message === "LEAGUE_CAP") {
          return jsonError("You can join at most 30 private leagues", 400, {
            code: "LEAGUE_CAP",
          });
        }
      }
      throw e;
    }
  } catch (error) {
    console.error("[play] league join failed:", error);
    return jsonError("Failed to join league", 500);
  }
});
