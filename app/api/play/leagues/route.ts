import { NextRequest } from "next/server";
import { withRateLimitAndAnalytics } from "@/app/lib/analytics-middleware";
import { trackBusinessEvent } from "@/app/lib/server-analytics";
import { createLeague, listLeaguesForWallet } from "@/app/lib/fantasy/leagues";
import {
  fantasyDisabledResponse,
  getAuthedWallet,
  getCurrentMatchday,
  getParticipant,
  isFantasyEnabled,
  jsonError,
  jsonOk,
} from "@/app/lib/fantasy/server";

/**
 * GET /api/play/leagues — leagues the caller belongs to (with join-week standings).
 * POST /api/play/leagues — create a mini-league { name }.
 */
export const GET = withRateLimitAndAnalytics(async (request: NextRequest) => {
  if (!isFantasyEnabled()) return fantasyDisabledResponse();

  try {
    const auth = await getAuthedWallet(request);
    if (!auth) return jsonError("Unauthorized", 401);

    const participant = await getParticipant(auth.walletAddress);
    if (!participant) return jsonError("Join the league first", 403, { code: "NOT_JOINED" });

    const leagues = await listLeaguesForWallet(auth.walletAddress);
    return jsonOk({ leagues });
  } catch (error) {
    console.error("[play] leagues list failed:", error);
    return jsonError("Failed to load leagues", 500);
  }
});

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
    const name = typeof body?.name === "string" ? body.name : "";
    if (name.trim().length < 3) {
      return jsonError("League name must be at least 3 characters", 400);
    }

    try {
      const league = await createLeague({
        name,
        wallet: auth.walletAddress,
        joinedGameweek: matchday.id,
      });
      trackBusinessEvent("Fantasy League Created", {
        wallet_address: auth.walletAddress,
        league_id: league.id,
      });
      return jsonOk({ league }, { status: 201 });
    } catch (e) {
      if (e instanceof Error && e.message === "NAME_TOO_SHORT") {
        return jsonError("League name must be at least 3 characters", 400);
      }
      if (e instanceof Error && e.message === "LEAGUE_CAP") {
        return jsonError("You can join at most 30 private leagues", 400, {
          code: "LEAGUE_CAP",
        });
      }
      throw e;
    }
  } catch (error) {
    console.error("[play] league create failed:", error);
    return jsonError("Failed to create league", 500);
  }
});
