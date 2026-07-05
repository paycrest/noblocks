import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";
import { trackBusinessEvent } from "@/app/lib/server-analytics";
import { getFantasySettings, matchdayLabel } from "@/app/lib/fantasy/settings";
import { validateSquad } from "@/app/lib/fantasy/validation";
import { computeTransferCost } from "@/app/lib/fantasy/scoring";
import {
  fantasyDisabledResponse,
  getAuthedWallet,
  getCurrentMatchday,
  getParticipant,
  getPlayersMap,
  getSquad,
  isFantasyEnabled,
  isMatchdayLocked,
  jsonError,
  jsonOk,
} from "@/app/lib/fantasy/server";

interface TransferRequest {
  transfers: { out: number; in: number }[];
}

/**
 * POST /api/play/transfers — swap squad members before the round locks.
 * Each transfer beyond the round's free allocation costs −3 points, applied
 * as a deduction when the round is scored (TRD §6.4). No carry-over.
 * Confirmed transfers are irreversible.
 */
export const POST = withRateLimit(async (request: NextRequest) => {
  if (!isFantasyEnabled()) return fantasyDisabledResponse();

  try {
    const auth = await getAuthedWallet(request);
    if (!auth) return jsonError("Unauthorized", 401);

    const participant = await getParticipant(auth.walletAddress);
    if (!participant) return jsonError("Join the league first", 403, { code: "NOT_JOINED" });
    if (participant.disqualified) return jsonError("Account disqualified", 403);

    const matchday = await getCurrentMatchday();
    if (!matchday) return jsonError("No active matchday", 404);
    if (isMatchdayLocked(matchday)) {
      // Official rule: transfers made during a live round apply next round.
      // We open transfers as soon as the round rolls over instead (minutes
      // after the last final whistle) — simpler and near-equivalent.
      return jsonError("Transfers are closed during a live round — they reopen right after it ends", 403, {
        code: "ROUND_LOCKED",
      });
    }

    const body = (await request.json().catch(() => null)) as TransferRequest | null;
    const transfers = (body?.transfers ?? [])
      .map((t) => ({ out: Number(t.out), in: Number(t.in) }))
      .filter((t) => Number.isFinite(t.out) && Number.isFinite(t.in) && t.out !== t.in);
    if (transfers.length === 0) return jsonError("No transfers submitted", 400);

    const squad = await getSquad(auth.walletAddress, matchday.id);
    if (!squad) return jsonError("Create your squad first", 400, { code: "NO_SQUAD" });
    if (squad.is_initial) {
      return jsonError("Your first squad can still be edited freely — no transfers needed", 400, {
        code: "STILL_INITIAL",
      });
    }

    const [settings, players] = await Promise.all([getFantasySettings(), getPlayersMap()]);

    // Apply swaps: incoming player inherits the outgoing player's slot and
    // captaincy so the lineup stays structurally intact.
    const bySlot = new Map(squad.players.map((p) => [p.player_id, p]));
    for (const { out, in: incoming } of transfers) {
      const outgoing = bySlot.get(out);
      if (!outgoing) return jsonError("Transfer-out player is not in your squad", 400);
      if (bySlot.has(incoming)) return jsonError("Transfer-in player is already in your squad", 400);
      if (!players.get(incoming)?.is_active) {
        return jsonError("Transfer-in player is from an eliminated team", 400);
      }
      bySlot.delete(out);
      bySlot.set(incoming, { ...outgoing, player_id: incoming });
    }

    const updated = [...bySlot.values()];
    const selection = {
      players: updated.map((p) => ({ playerId: p.player_id, slot: p.slot })),
      captainId: updated.find((p) => p.is_captain)?.player_id ?? 0,
      viceId: updated.find((p) => p.is_vice)?.player_id ?? 0,
    };

    const validation = validateSquad({
      selection,
      players,
      settings,
      matchdayLabel: matchdayLabel(matchday.id),
    });
    if (!validation.ok) {
      return jsonError("Transfers would make your squad invalid", 400, {
        errors: validation.errors,
      });
    }

    const { freeUsed, pointsCost } = computeTransferCost(
      transfers.length,
      squad.free_transfers_remaining,
      settings.transfer_penalty,
    );

    const budgetSpent = selection.players.reduce(
      (sum, { playerId }) => sum + Number(players.get(playerId)?.price ?? 0),
      0,
    );

    // Persist: squad totals, composition, and the irreversible transfer log.
    const { error: squadError } = await supabaseAdmin
      .from("fantasy_squads")
      .update({
        budget_spent: budgetSpent,
        free_transfers_remaining: squad.free_transfers_remaining - freeUsed,
        transfer_points_deduction: squad.transfer_points_deduction + pointsCost,
      })
      .eq("id", squad.id);
    if (squadError) throw squadError;

    const { error: deleteError } = await supabaseAdmin
      .from("fantasy_squad_players")
      .delete()
      .eq("squad_id", squad.id);
    if (deleteError) throw deleteError;

    const { error: insertError } = await supabaseAdmin.from("fantasy_squad_players").insert(
      updated.map((p) => ({
        squad_id: squad.id,
        player_id: p.player_id,
        slot: p.slot,
        is_captain: p.is_captain,
        is_vice: p.is_vice,
      })),
    );
    if (insertError) throw insertError;

    const { error: logError } = await supabaseAdmin.from("fantasy_transfers").insert(
      transfers.map((t, i) => ({
        wallet_address: auth.walletAddress,
        matchday_id: matchday.id,
        player_out: t.out,
        player_in: t.in,
        points_cost: i < freeUsed ? 0 : settings.transfer_penalty,
      })),
    );
    if (logError) throw logError;

    trackBusinessEvent("Fantasy Transfers Made", {
      wallet_address: auth.walletAddress,
      matchday_id: matchday.id,
      count: transfers.length,
      points_cost: pointsCost,
    });

    return jsonOk({
      applied: transfers.length,
      free_transfers_remaining: squad.free_transfers_remaining - freeUsed,
      points_cost: pointsCost,
      total_deduction: squad.transfer_points_deduction + pointsCost,
    });
  } catch (error) {
    console.error("[play] transfers failed:", error);
    return jsonError("Failed to apply transfers", 500);
  }
});
