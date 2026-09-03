import { supabaseAdmin } from "../../supabase";
import { fetchAll } from "../pagination";
import { getPlayersMap } from "../players";
import type { FantasySettings } from "../types";
import { nextMatchday, type MatchdayRow } from "../server";
import { batchUpsertParticipants } from "./scoring";

/**
 * live→finalizing rollover: snapshot ranks into previous_rank, clone every
 * squad into the next matchday (is_initial=false, fresh free transfers, no
 * deduction) and drop players marked inactive in the pool (relegated / removed).
 */
export async function rolloverMatchday(
  finished: MatchdayRow,
  matchdays: MatchdayRow[],
  settings: FantasySettings,
  alerts: string[],
): Promise<void> {
  const participants = await fetchAll<{
    wallet_address: string;
    current_rank: number | null;
    previous_rank: number | null;
  }>((from, to) =>
    supabaseAdmin
      .from("fantasy_participants")
      .select("wallet_address, current_rank, previous_rank")
      .range(from, to),
  );
  const snapshotTargets = participants.filter((p) => p.previous_rank !== p.current_rank);
  await batchUpsertParticipants(
    snapshotTargets.map((p) => ({
      wallet_address: p.wallet_address,
      previous_rank: p.current_rank,
    })),
  );

  const next = nextMatchday(matchdays, finished.id);
  if (!next) return;

  const [squads, playersMap] = await Promise.all([
    fetchAll<{
      wallet_address: string;
      budget_spent: number;
      free_transfers_remaining: number;
      players: { player_id: number; slot: number; is_captain: boolean; is_vice: boolean }[];
    }>((from, to) =>
      supabaseAdmin
        .from("fantasy_squads")
        .select(
          "wallet_address, budget_spent, free_transfers_remaining, players:fantasy_squad_players(player_id, slot, is_captain, is_vice)",
        )
        .eq("matchday_id", finished.id)
        .range(from, to),
    ),
    getPlayersMap(),
  ]);

  const existingNext = await fetchAll<{ wallet_address: string }>((from, to) =>
    supabaseAdmin
      .from("fantasy_squads")
      .select("wallet_address")
      .eq("matchday_id", next.id)
      .range(from, to),
  );
  const alreadyRolled = new Set(existingNext.map((s) => s.wallet_address));

  for (const squad of squads) {
    if (alreadyRolled.has(squad.wallet_address)) continue;
    const nextFT = Math.min(
      Number(squad.free_transfers_remaining) + 1,
      settings.free_transfers_max,
    );

    const activePlayers = (squad.players ?? []).filter((p) => {
      const pool = playersMap.get(p.player_id);
      return pool?.is_active !== false;
    });
    const budgetSpent =
      activePlayers.length === (squad.players ?? []).length
        ? squad.budget_spent
        : activePlayers.reduce(
            (sum, p) => sum + Number(playersMap.get(p.player_id)?.price ?? 0),
            0,
          );

    const { data: squadId, error: saveError } = await supabaseAdmin.rpc("fantasy_save_squad", {
      p_squad_id: null,
      p_wallet_address: squad.wallet_address,
      p_matchday_id: next.id,
      p_budget_spent: budgetSpent,
      p_is_initial: false,
      p_players: activePlayers.map((p) => ({
        playerId: p.player_id,
        slot: p.slot,
        isCaptain: p.is_captain,
        isVice: p.is_vice,
      })),
    });
    if (saveError) {
      if (saveError.code === "23505") continue;
      alerts.push(`rollover: squad clone failed for ${squad.wallet_address}`);
      continue;
    }

    const { error: metaError } = await supabaseAdmin
      .from("fantasy_squads")
      .update({
        free_transfers_remaining: nextFT,
        transfer_points_deduction: 0,
      })
      .eq("id", squadId);
    if (metaError) {
      await supabaseAdmin.from("fantasy_squads").delete().eq("id", squadId);
      alerts.push(`rollover: squad meta update failed for ${squad.wallet_address}`);
    }
  }
}
