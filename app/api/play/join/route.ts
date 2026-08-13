import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimitAndAnalytics } from "@/app/lib/analytics-middleware";
import { trackBusinessEvent } from "@/app/lib/server-analytics";
import { validateUsername, suggestUsernames } from "@/app/lib/fantasy/validation";
import { getFantasySettings } from "@/app/lib/fantasy/settings";
import {
  fantasyDisabledResponse,
  getAuthedWallet,
  getCurrentMatchday,
  getParticipant,
  isFantasyEnabled,
  isMatchdayLocked,
  jsonError,
  jsonOk,
} from "@/app/lib/fantasy/server";

/**
 * POST /api/play/join — create the permanent username and enter the one
 * global league. Idempotent: re-joining returns the existing participant.
 * Body: { username: string, acceptTerms: true }
 */
export const POST = withRateLimitAndAnalytics(async (request: NextRequest) => {
  if (!isFantasyEnabled()) return fantasyDisabledResponse();

  try {
    const auth = await getAuthedWallet(request);
    if (!auth) return jsonError("Unauthorized", 401);
    const { walletAddress } = auth;

    const existing = await getParticipant(walletAddress);
    if (existing) {
      const { data: profile } = await supabaseAdmin
        .from("user_kyc_profiles")
        .select("username")
        .eq("wallet_address", walletAddress)
        .maybeSingle();
      return jsonOk({
        joined: true,
        already_joined: true,
        username: profile?.username ?? null,
      });
    }

    // Join open while features.join_open and a season matchday exists.
    // Closed when the last season GW is locked/final (or join_open false).
    const settings = await getFantasySettings();
    const currentMatchday = await getCurrentMatchday();
    const seasonComplete =
      !currentMatchday ||
      (currentMatchday.id >= settings.season_matchday_max &&
        isMatchdayLocked(currentMatchday));
    if (!settings.features.join_open || seasonComplete) {
      return jsonError("The league is closed to new entries", 403, {
        code: "JOIN_CLOSED",
      });
    }

    const body = await request.json().catch(() => ({}));
    if (body?.acceptTerms !== true) {
      return jsonError("You must accept the terms to join", 400, {
        code: "TERMS_REQUIRED",
      });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("user_kyc_profiles")
      .select("username")
      .eq("wallet_address", walletAddress)
      .maybeSingle();
    if (profileError) throw profileError;

    let username = profile?.username as string | null;
    if (!username) {
      const validation = validateUsername(String(body?.username ?? ""));
      if (!validation.ok) {
        return jsonError(validation.error, 400, { code: "INVALID_USERNAME" });
      }
      username = validation.normalized;
    }

    const { data: joinResult, error: joinError } = await supabaseAdmin.rpc(
      "fantasy_join_participant",
      {
        p_wallet_address: walletAddress,
        p_username: username,
        p_terms_accepted_at: new Date().toISOString(),
      },
    );
    if (joinError) {
      if (joinError.message?.includes("USERNAME_TAKEN")) {
        return jsonError("That username was just taken", 409, {
          code: "USERNAME_TAKEN",
          suggestions: suggestUsernames(username),
        });
      }
      throw joinError;
    }

    const payload = joinResult as { already_joined?: boolean; username?: string | null };
    const alreadyJoined = payload.already_joined === true;

    if (!alreadyJoined) {
      trackBusinessEvent("Fantasy League Joined", {
        wallet_address: walletAddress,
        username: payload.username ?? username,
      });
    }

    return jsonOk(
      {
        joined: true,
        already_joined: alreadyJoined,
        username: payload.username ?? username,
      },
      { status: alreadyJoined ? 200 : 201 },
    );
  } catch (error) {
    console.error("[play] join failed:", error);
    return jsonError("Failed to join the league", 500);
  }
});
