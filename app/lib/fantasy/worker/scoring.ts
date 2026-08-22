import { supabaseAdmin } from "../../supabase";
import { applyAutoSubs } from "../autosubs";
import { computeSquadPoints } from "../scoring";
import { getFantasySettings, invalidateFantasySettingsCache } from "../settings";
import { getPlayersMap, invalidatePlayersCache } from "../players";
import { chunkArray, fetchAll, IN_CHUNK } from "../pagination";
import type { FantasySettings, Position } from "../types";

/** Skip overlapping ticks when another run started within this window (seconds). */
const WORKER_STALE_SECONDS = 90;

/**
 * Claim the cross-instance run lock. Resolves to a uuid ownership token, or
 * null when another tick holds a non-stale claim. The token must be handed
 * back to releaseWorkerRun so a tick whose lock was already reclaimed as stale
 * cannot clear its successor's claim on the way out.
 */
export async function tryAcquireWorkerRun(): Promise<string | null> {
  const { data, error } = await supabaseAdmin.rpc("fantasy_worker_try_acquire", {
    p_stale_seconds: WORKER_STALE_SECONDS,
  });
  if (error) throw error;
  return typeof data === "string" ? data : null;
}

export async function releaseWorkerRun(token: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc("fantasy_worker_release", {
    p_token: token,
  });
  if (error) throw error;
}

export type ParticipantPatch = {
  wallet_address: string;
  total_points?: number;
  current_rank?: number;
  previous_rank?: number | null;
};

/** One patch per normalized wallet; later rows override defined fields. */
export function mergeParticipantPatches(rows: ParticipantPatch[]): ParticipantPatch[] {
  const byWallet = new Map<string, ParticipantPatch>();
  for (const row of rows) {
    const wallet = row.wallet_address.trim().toLowerCase();
    const merged: ParticipantPatch = { ...(byWallet.get(wallet) ?? { wallet_address: wallet }) };
    merged.wallet_address = wallet;
    if (row.total_points !== undefined) merged.total_points = row.total_points;
    if (row.current_rank !== undefined) merged.current_rank = row.current_rank;
    if (row.previous_rank !== undefined) merged.previous_rank = row.previous_rank;
    byWallet.set(wallet, merged);
  }
  return [...byWallet.values()];
}

/**
 * Batch-merge score/rank patches onto existing participants.
 * Preflight resolves canonical wallet_address values, then UPDATE-only (join
 * owns inserts + terms_accepted_at; upsert partial rows can still INSERT).
 */
export async function batchUpsertParticipants(
  rows: ParticipantPatch[],
  batchSize = 500,
): Promise<void> {
  if (rows.length === 0) return;
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error("batchSize must be a positive integer");
  }

  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = mergeParticipantPatches(rows.slice(i, i + batchSize));
    const wallets = chunk.map((r) => r.wallet_address);

    const canonical = new Map<string, string>();
    for (const walletChunk of chunkArray(wallets, IN_CHUNK)) {
      const { data, error } = await supabaseAdmin
        .from("fantasy_participants")
        .select("wallet_address")
        .in("wallet_address", walletChunk);
      if (error) throw error;
      for (const row of data ?? []) {
        const key = row.wallet_address.trim().toLowerCase();
        canonical.set(key, row.wallet_address);
      }
    }

    const patches = chunk.filter((row) => canonical.has(row.wallet_address));
    if (patches.length === 0) continue;

    await Promise.all(
      patches.map(async (row) => {
        const patch: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };
        if (row.total_points !== undefined) patch.total_points = row.total_points;
        if (row.current_rank !== undefined) patch.current_rank = row.current_rank;
        if (row.previous_rank !== undefined) patch.previous_rank = row.previous_rank;

        const { error } = await supabaseAdmin
          .from("fantasy_participants")
          .update(patch)
          .eq("wallet_address", canonical.get(row.wallet_address)!);
        if (error) throw error;
      }),
    );
  }
}

/** Recompute matchday scores, participant totals and ranks (idempotent). */
export async function recomputeScores(
  matchdayIds: number[],
  alerts: string[] = [],
): Promise<number> {
  if (matchdayIds.length === 0) return 0;
  let updated = 0;
  const settings = await getFantasySettings();
  const playersMap = await getPlayersMap();
  const missingPlayerIds = new Set<number>();

  for (const matchdayId of matchdayIds) {
    const { data: fixtures, error: fxError } = await supabaseAdmin
      .from("fantasy_fixtures")
      .select("provider_fixture_id")
      .eq("matchday_id", matchdayId);
    if (fxError) throw fxError;
    const fixtureIds = (fixtures ?? []).map((f) => Number(f.provider_fixture_id));

    const statRows =
      fixtureIds.length === 0
        ? []
        : await fetchAll<{
            player_id: number;
            points: number;
            stats: { minutes?: number; yellowCards?: number; redCards?: number };
          }>((from, to) =>
            supabaseAdmin
              .from("fantasy_player_match_stats")
              .select("player_id, points, stats")
              .in("provider_fixture_id", fixtureIds)
              .range(from, to),
          );

    const playerPoints = new Map<
      number,
      { points: number; minutes: number; yellowCards: number; redCards: number }
    >();
    for (const row of statRows) {
      const id = Number(row.player_id);
      const prev = playerPoints.get(id) ?? {
        points: 0,
        minutes: 0,
        yellowCards: 0,
        redCards: 0,
      };
      playerPoints.set(id, {
        points: prev.points + Number(row.points),
        minutes: prev.minutes + Number(row.stats?.minutes ?? 0),
        yellowCards: prev.yellowCards + Number(row.stats?.yellowCards ?? 0),
        redCards: prev.redCards + Number(row.stats?.redCards ?? 0),
      });
    }

    const squads = await fetchAll<{
      wallet_address: string;
      transfer_points_deduction: number;
      players: {
        player_id: number;
        slot: number;
        is_captain: boolean;
        is_vice: boolean;
      }[];
    }>((from, to) =>
      supabaseAdmin
        .from("fantasy_squads")
        .select(
          "wallet_address, transfer_points_deduction, players:fantasy_squad_players(player_id, slot, is_captain, is_vice)",
        )
        .eq("matchday_id", matchdayId)
        .range(from, to),
    );

    const scoreRows = squads.map((squad) => {
      const squadRows = (squad.players ?? []).map((p) => {
        const pid = Number(p.player_id);
        const mapped = playersMap.get(pid);
        if (!mapped) {
          if (!missingPlayerIds.has(pid)) {
            missingPlayerIds.add(pid);
            alerts.push(
              `recomputeScores: player ${pid} missing from fantasy_players — treating as MID`,
            );
          }
        }
        const pos = mapped?.position ?? ("MID" as Position);
        return {
          playerId: pid,
          slot: Number(p.slot),
          isCaptain: p.is_captain,
          isVice: p.is_vice,
          position: pos,
        };
      });
      const { points } = computeSquadPoints(
        {
          squad: squadRows,
          playerPoints,
          transferPointsDeduction: squad.transfer_points_deduction,
        },
        applyAutoSubs,
      );
      return {
        wallet_address: squad.wallet_address,
        matchday_id: matchdayId,
        points,
      };
    });

    for (let i = 0; i < scoreRows.length; i += 500) {
      const { error } = await supabaseAdmin
        .from("fantasy_matchday_scores")
        .upsert(scoreRows.slice(i, i + 500), { onConflict: "wallet_address,matchday_id" });
      if (error) throw error;
    }
    updated += scoreRows.length;
  }

  // Season-scoped totals only (WC scores on ids &lt; 101 must not return).
  const allScores = await fetchAll<{ wallet_address: string; points: number }>((from, to) =>
    supabaseAdmin
      .from("fantasy_matchday_scores")
      .select("wallet_address, points")
      .gte("matchday_id", settings.season_matchday_min)
      .lte("matchday_id", settings.season_matchday_max)
      .range(from, to),
  );
  const totals = new Map<string, number>();
  for (const row of allScores) {
    totals.set(row.wallet_address, (totals.get(row.wallet_address) ?? 0) + Number(row.points));
  }

  const participants = await fetchAll<{
    wallet_address: string;
    total_points: number;
    current_rank: number | null;
  }>((from, to) =>
    supabaseAdmin
      .from("fantasy_participants")
      .select("wallet_address, total_points, current_rank")
      .range(from, to),
  );

  const pointsChanges = participants.filter(
    (p) => (totals.get(p.wallet_address) ?? 0) !== p.total_points,
  );
  await batchUpsertParticipants(
    pointsChanges.map((p) => ({
      wallet_address: p.wallet_address,
      total_points: totals.get(p.wallet_address) ?? 0,
    })),
  );

  const leaderboard = await fetchAll<{ wallet_address: string; rank: number }>((from, to) =>
    supabaseAdmin.from("fantasy_leaderboard").select("wallet_address, rank").range(from, to),
  );
  const currentRanks = new Map(participants.map((p) => [p.wallet_address, p.current_rank]));
  const rankChanges = leaderboard.filter(
    (r) => currentRanks.get(r.wallet_address) !== Number(r.rank),
  );
  await batchUpsertParticipants(
    rankChanges.map((r) => ({
      wallet_address: r.wallet_address,
      current_rank: Number(r.rank),
    })),
  );

  return updated;
}

/**
 * Drain the one-shot pending_rescore_matchdays queue (written by migrations
 * that rewrite kickoff stamps directly) after a successful recompute. A
 * failed clear just repeats the rescore next tick — recompute is idempotent.
 */
export async function clearPendingRescore(alerts: string[]): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("fantasy_settings")
    .select("config")
    .eq("id", 1)
    .single();
  if (error || !data) {
    alerts.push(`pending rescore clear failed: ${String(error?.message ?? "no row")}`);
    return;
  }
  const { pending_rescore_matchdays: _drained, ...config } =
    data.config as FantasySettings;
  const { error: updateError } = await supabaseAdmin
    .from("fantasy_settings")
    .update({ config, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (updateError) {
    alerts.push(`pending rescore clear failed: ${String(updateError.message)}`);
    return;
  }
  invalidateFantasySettingsCache();
  invalidatePlayersCache();
}
