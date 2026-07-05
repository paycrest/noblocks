import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";
import { getFantasySettings } from "@/app/lib/fantasy/settings";
import {
  fantasyDisabledResponse,
  getAuthedWallet,
  getParticipant,
  isFantasyEnabled,
  jsonError,
  jsonOk,
} from "@/app/lib/fantasy/server";

/**
 * GET /api/play/rewards — own referral qualification progress. The referral
 * link itself comes from the existing referral system (/api/referral/referral-data);
 * this endpoint only reports campaign progress. A user only ever sees their
 * OWN counts (PRD §7.3).
 */
export const GET = withRateLimit(async (request: NextRequest) => {
  if (!isFantasyEnabled()) return fantasyDisabledResponse();

  try {
    const auth = await getAuthedWallet(request);
    if (!auth) return jsonError("Unauthorized", 401);

    const [participant, settings] = await Promise.all([
      getParticipant(auth.walletAddress),
      getFantasySettings(),
    ]);
    if (!participant) return jsonError("Join the league first", 403, { code: "NOT_JOINED" });

    const { data: progress, error } = await supabaseAdmin
      .from("fantasy_referral_progress")
      .select("referred_wallet_address, signed_up_at, total_tx_usd, activated_at")
      .eq("referrer_wallet_address", auth.walletAddress)
      .order("signed_up_at", { ascending: true });
    if (error) throw error;

    const referrals = (progress ?? []).map((row) => ({
      wallet_short: `${String(row.referred_wallet_address).slice(0, 6)}...${String(row.referred_wallet_address).slice(-4)}`,
      signed_up_at: row.signed_up_at,
      total_tx_usd: Number(row.total_tx_usd),
      activated: row.activated_at != null,
    }));
    const activated = referrals.filter((r) => r.activated).length;

    return jsonOk({
      required: settings.referrals_required,
      min_total_usd: settings.referral_min_total_usd,
      activated,
      referrals,
      qualified:
        activated >= settings.referrals_required &&
        participant.giveaway_opt_in &&
        !participant.disqualified,
      giveaway_opt_in: participant.giveaway_opt_in,
      deadline: settings.qualification_deadline,
      rank: participant.current_rank,
      total_points: participant.total_points,
    });
  } catch (error) {
    console.error("[play] rewards fetch failed:", error);
    return jsonError("Failed to load rewards", 500);
  }
});
