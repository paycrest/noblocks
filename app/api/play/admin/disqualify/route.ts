import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";
import { requireAdmin } from "@/app/lib/fantasy/admin";
import { jsonError, jsonOk } from "@/app/lib/fantasy/server";

/**
 * POST /api/play/admin/disqualify — anti-fraud lever (F-15, PRD right to
 * disqualify). Body: { walletAddress, disqualified: boolean, reason?: string }.
 * Sets fantasy_participants.disqualified (works both ways, so it also
 * reinstates) and, when a reason is given, appends an audit entry to the
 * participant's `flags` jsonb array.
 */
export const POST = withRateLimit(async (request: NextRequest) => {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json().catch(() => ({}));
    const walletAddress = String(body?.walletAddress ?? "")
      .trim()
      .toLowerCase();
    if (!walletAddress) {
      return jsonError("walletAddress is required", 400);
    }
    if (typeof body?.disqualified !== "boolean") {
      return jsonError("disqualified must be a boolean", 400);
    }
    const disqualified = body.disqualified as boolean;
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

    const { data: participant, error: readError } = await supabaseAdmin
      .from("fantasy_participants")
      .select("wallet_address, disqualified, flags")
      .eq("wallet_address", walletAddress)
      .maybeSingle();
    if (readError) throw readError;
    if (!participant) return jsonError("Participant not found", 404);

    const currentFlags = Array.isArray(participant.flags)
      ? (participant.flags as unknown[])
      : [];
    const update: { disqualified: boolean; flags?: unknown[] } = {
      disqualified,
    };
    if (reason) {
      update.flags = [
        ...currentFlags,
        { type: "disqualification", reason, at: new Date().toISOString() },
      ];
    }

    const { error: updateError } = await supabaseAdmin
      .from("fantasy_participants")
      .update(update)
      .eq("wallet_address", walletAddress);
    if (updateError) throw updateError;

    return jsonOk({
      wallet_address: walletAddress,
      disqualified,
      flags: update.flags ?? currentFlags,
    });
  } catch (error) {
    console.error("[play admin] disqualify update failed:", error);
    return jsonError("Failed to update disqualification", 500);
  }
});
