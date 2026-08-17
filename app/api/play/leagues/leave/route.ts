import { NextRequest } from "next/server";
import { withRateLimitAndAnalytics } from "@/app/lib/analytics-middleware";
import { trackBusinessEvent } from "@/app/lib/server-analytics";
import { leaveLeague } from "@/app/lib/fantasy/leagues";
import {
  fantasyDisabledResponse,
  getAuthedWallet,
  getParticipant,
  isFantasyEnabled,
  jsonError,
  jsonOk,
} from "@/app/lib/fantasy/server";

/** POST /api/play/leagues/leave — { leagueId } */
export const POST = withRateLimitAndAnalytics(async (request: NextRequest) => {
  if (!isFantasyEnabled()) return fantasyDisabledResponse();

  try {
    const auth = await getAuthedWallet(request);
    if (!auth) return jsonError("Unauthorized", 401);

    const participant = await getParticipant(auth.walletAddress);
    if (!participant) return jsonError("Join the league first", 403, { code: "NOT_JOINED" });

    const body = await request.json().catch(() => null);
    const leagueId = typeof body?.leagueId === "string" ? body.leagueId : "";
    if (!leagueId) return jsonError("Provide leagueId", 400);

    await leaveLeague(leagueId, auth.walletAddress);
    trackBusinessEvent("Fantasy League Left", {
      wallet_address: auth.walletAddress,
      league_id: leagueId,
    });
    return jsonOk({ left: true });
  } catch (error) {
    console.error("[play] league leave failed:", error);
    return jsonError("Failed to leave league", 500);
  }
});
