import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";
import { trackBusinessEvent } from "@/app/lib/server-analytics";
import { getFantasySettings, matchdayLabel } from "@/app/lib/fantasy/settings";
import { validateSquad } from "@/app/lib/fantasy/validation";
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

    const budgetSpent = selection.players.reduce(
      (sum, { playerId }) => sum + Number(players.get(playerId)?.price ?? 0),
      0,
    );

    // Persist squad totals, composition, and the transfer log together in one
    // RPC call. The function locks the squad row and recomputes free/paid
    // transfers from its current free_transfers_remaining, so two concurrent
    // requests can't both spend the same free transfers.
    const { data: result, error: applyError } = await supabaseAdmin.rpc(
      "fantasy_apply_transfers",
      {
        p_squad_id: squad.id,
        p_wallet_address: auth.walletAddress,
        p_matchday_id: matchday.id,
        p_budget_spent: budgetSpent,
        p_players: updated.map((p) => ({
          playerId: p.player_id,
          slot: p.slot,
          isCaptain: p.is_captain,
          isVice: p.is_vice,
        })),
        p_transfers: transfers.map((t) => ({ out: t.out, in: t.in })),
        p_penalty: settings.transfer_penalty,
      },
    );
    if (applyError) throw applyError;
    if (result?.error) return jsonError("Squad not found", 404, { code: "NO_SQUAD" });

    trackBusinessEvent("Fantasy Transfers Made", {
      wallet_address: auth.walletAddress,
      matchday_id: matchday.id,
      count: transfers.length,
      points_cost: result.points_cost,
    });

    return jsonOk({
      applied: transfers.length,
      free_transfers_remaining: result.free_transfers_remaining,
      points_cost: result.points_cost,
      total_deduction: result.total_deduction,
    });
  } catch (error) {
    console.error("[play] transfers failed:", error);
    return jsonError("Failed to apply transfers", 500);
  }
});
