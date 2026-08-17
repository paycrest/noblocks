import { NextRequest } from "next/server";
import { withRateLimitAndAnalytics } from "@/app/lib/analytics-middleware";
import { listLeaguesForWallet } from "@/app/lib/fantasy/leagues";
import {
  fantasyDisabledResponse,
  getAuthedWallet,
  getParticipant,
  isFantasyEnabled,
  jsonError,
  jsonOk,
} from "@/app/lib/fantasy/server";

/**
 * GET /api/play/rewards — mini-leagues hub (rank + standings context).
 */
export const GET = withRateLimitAndAnalytics(async (request: NextRequest) => {
  if (!isFantasyEnabled()) return fantasyDisabledResponse();

  try {
    const auth = await getAuthedWallet(request);
    if (!auth) return jsonError("Unauthorized", 401);

    const participant = await getParticipant(auth.walletAddress);
    if (!participant) return jsonError("Join the league first", 403, { code: "NOT_JOINED" });

    const leagues = await listLeaguesForWallet(auth.walletAddress);

    return jsonOk({
      stub: false,
      message: "",
      rank: participant.current_rank,
      total_points: participant.total_points,
      leagues,
    });
  } catch (error) {
    console.error("[play] rewards fetch failed:", error);
    return jsonError("Failed to load leagues", 500);
  }
});
