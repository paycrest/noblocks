import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";
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

const isUniqueViolation = (error: { code?: string; message?: string } | null) =>
  error?.code === "23505" ||
  Boolean(error?.message?.toLowerCase().includes("duplicate")) ||
  Boolean(error?.message?.toLowerCase().includes("unique"));

/**
 * POST /api/play/join — create the permanent username and enter the one
 * global league. Idempotent: re-joining returns the existing participant.
 * Body: { username: string, acceptTerms: true, giveawayOptIn?: boolean }
 */
export const POST = withRateLimit(async (request: NextRequest) => {
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

    // Joining stays open until the Final's lineup lock (PRD O-3).
    const settings = await getFantasySettings();
    const currentMatchday = await getCurrentMatchday();
    if (!settings.features.join_open || !currentMatchday || (currentMatchday.id === 8 && isMatchdayLocked(currentMatchday))) {
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
    const giveawayOptIn = body?.giveawayOptIn !== false; // defaults ON (PRD §7.1)

    const validation = validateUsername(String(body?.username ?? ""));
    if (!validation.ok) {
      return jsonError(validation.error, 400, { code: "INVALID_USERNAME" });
    }
    const username = validation.normalized;

    // Usernames are permanent — if this wallet already has one (edge case:
    // profile written by a prior partial join), keep it.
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("user_kyc_profiles")
      .select("username")
      .eq("wallet_address", walletAddress)
      .maybeSingle();
    if (profileError) throw profileError;

    let finalUsername = profile?.username as string | null;

    if (!finalUsername) {
      const { error: upsertError } = await supabaseAdmin
        .from("user_kyc_profiles")
        .upsert(
          { wallet_address: walletAddress, username },
          { onConflict: "wallet_address" },
        );
      if (upsertError) {
        if (isUniqueViolation(upsertError)) {
          return jsonError("That username was just taken", 409, {
            code: "USERNAME_TAKEN",
            suggestions: suggestUsernames(username),
          });
        }
        throw upsertError;
      }
      finalUsername = username;
    }

    const { error: participantError } = await supabaseAdmin
      .from("fantasy_participants")
      .insert({
        wallet_address: walletAddress,
        terms_accepted_at: new Date().toISOString(),
        giveaway_opt_in: giveawayOptIn,
      });
    if (participantError && !isUniqueViolation(participantError)) {
      throw participantError;
    }

    trackBusinessEvent("Fantasy League Joined", {
      wallet_address: walletAddress,
      username: finalUsername,
      giveaway_opt_in: giveawayOptIn,
    });

    return jsonOk(
      { joined: true, already_joined: false, username: finalUsername },
      { status: 201 },
    );
  } catch (error) {
    console.error("[play] join failed:", error);
    return jsonError("Failed to join the league", 500);
  }
});
