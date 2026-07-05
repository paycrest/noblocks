import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";
import { trackBusinessEvent } from "@/app/lib/server-analytics";
import { getFantasySettings, qualificationDeadline } from "@/app/lib/fantasy/settings";
import {
  fantasyDisabledResponse,
  getAuthedWallet,
  getParticipant,
  isFantasyEnabled,
  jsonError,
  jsonOk,
} from "@/app/lib/fantasy/server";

/**
 * POST /api/play/opt-in — toggle between the giveaway track and the
 * bragging-rights track. Allowed any time before the qualification deadline
 * (PRD §7.1); enforced with server time.
 */
export const POST = withRateLimit(async (request: NextRequest) => {
  if (!isFantasyEnabled()) return fantasyDisabledResponse();

  try {
    const auth = await getAuthedWallet(request);
    if (!auth) return jsonError("Unauthorized", 401);

    const participant = await getParticipant(auth.walletAddress);
    if (!participant) return jsonError("Join the league first", 403, { code: "NOT_JOINED" });

    const settings = await getFantasySettings();
    if (Date.now() >= qualificationDeadline(settings).getTime()) {
      return jsonError("The qualification deadline has passed", 403, {
        code: "DEADLINE_PASSED",
      });
    }

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
    console.error("[play] opt-in toggle failed:", error);
    return jsonError("Failed to update giveaway preference", 500);
  }
});
