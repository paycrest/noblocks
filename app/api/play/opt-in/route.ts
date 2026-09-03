import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimitAndAnalytics } from "@/app/lib/analytics-middleware";
import { trackBusinessEvent } from "@/app/lib/server-analytics";
import {
  fantasyDisabledResponse,
  getAuthedWallet,
  getParticipant,
  isFantasyEnabled,
  jsonError,
  jsonOk,
} from "@/app/lib/fantasy/server";

/**
 * POST /api/play/opt-in — toggle giveaway vs bragging-rights track.
 * No qualification deadline in the EPL season.
 */
export const POST = withRateLimitAndAnalytics(async (request: NextRequest) => {
  if (!isFantasyEnabled()) return fantasyDisabledResponse();

  try {
    const auth = await getAuthedWallet(request);
    if (!auth) return jsonError("Unauthorized", 401);

    const participant = await getParticipant(auth.walletAddress);
    if (!participant) return jsonError("Join the league first", 403, { code: "NOT_JOINED" });

    const body = await request.json().catch(() => null);
    if (typeof body?.optIn !== "boolean") {
      return jsonError("Provide optIn: boolean", 400);
    }

    const { error } = await supabaseAdmin
      .from("fantasy_participants")
      .update({ giveaway_opt_in: body.optIn })
      .eq("wallet_address", auth.walletAddress);
    if (error) throw error;

    trackBusinessEvent(body.optIn ? "Fantasy Giveaway Opt In" : "Fantasy Giveaway Opt Out", {
      wallet_address: auth.walletAddress,
    });

    return jsonOk({ giveaway_opt_in: body.optIn });
  } catch (error) {
    console.error("[play] opt-in failed:", error);
    return jsonError("Failed to update opt-in", 500);
  }
});
