import "server-only";
import { supabaseAdmin } from "../supabase";
import { computePoints, computeSquadPoints, countsForScoring } from "./scoring";
import {
  FINISHED_STATUSES,
  LIVE_STATUSES,
  ROUND_TO_MATCHDAY,
  getNormalizedFixtureStats,
  getProviderRateLimit,
  getWorldCupFixtures,
} from "./provider";
import { getFantasySettings, matchdayLabel } from "./settings";
import { getPlayersMap, type MatchdayRow } from "./server";
import {
  claimNotification,
  isEmailConfigured,
  matchdayReminderEmail,
  oneAwayEmail,
  recapEmail,
  sendFantasyEmail,
} from "./notifications";
import { cumulativeActivation, type ReferralTx } from "./referral-math";
import type { FantasySettings, Position } from "./types";

/**
 * Scoring worker (TRD §3): the single writer for fixtures, stats, points,
 * ranks, rollovers and the referral sweep. Invoked once a minute (twice a
 * minute while a game is live — see live_window_active) by the Cloudflare
 * scheduler via POST /api/play/worker — the CF worker is just the alarm
 * clock, everything lives here.
 *
 * Provider frugality (TRD §2.4): API-Football is only called
 *   - every tick while a matchday window is active
 *     (lock_at ≤ now ≤ last kickoff + 4h, or fixtures still reconciling), and
 *   - once per 15 minutes for a fixture refresh while a round is upcoming.
 * Outside those windows a tick is a cheap DB-only pass.
 */

const FIXTURE_REFRESH_MINUTES = 15;
const REFERRAL_SWEEP_MINUTES = 5;
const STATS_MIN_INTERVAL_MS = 90_000;
// Finished fixtures re-pull at a gentler pace than live ones: stats barely
// move after FT, and a backfill of several already-finished fixtures (e.g.
// seeding mid-round) must not burn the provider quota.
const POST_FT_MIN_INTERVAL_MS = 5 * 60_000;
const POST_FT_CONTINUOUS_MS = 15 * 60_000;
// Stats freeze at FT+2h so the round can go final (and the next round's squad
// building open) the same evening instead of ~12h later. Vendor corrections
// landing after the freeze are recoverable by hand: reset the fixture's
// stats_finalized + last_stats_sync and the next tick re-pulls and rescores.
const RECONCILE_FINAL_MS = 2 * 60 * 60_000;
const ACTIVE_WINDOW_TAIL_MS = 4 * 60 * 60_000;
const MAX_EMAILS_PER_TICK = 50;
const PAGE = 1000;

export interface WorkerReport {
  ran_at: string;
  /** A matchday window is active — i.e. a game is on (TRD §2.4). Lets the
   * Cloudflare scheduler decide whether to tick faster than once a minute. */
  live_window_active: boolean;
  fixtures_refreshed: boolean;
  transitions: string[];
  /** Squad-player rows stamped with their XI/bench state at kickoff this tick. */
  kickoff_stamps: number;
  stats_synced: number;
  fixtures_finalized: number;
  scores_recomputed: number;
  rolled_over_to: number | null;
  referral_sweep: { referred: number; activated: number } | "skipped";
  notifications: { sent: number } | "skipped";
  provider_rate_limit: { remaining: number | null; limit: number | null };
  alerts: string[];
}

interface FixtureRow {
  provider_fixture_id: number;
  matchday_id: number;
  home_team_id: number;
  away_team_id: number;
  kickoff: string;
  status: string;
  finished_at: string | null;
  last_stats_sync: string | null;
  stats_finalized: boolean;
}

/** Page through a supabase query (the client caps responses at 1000 rows). */
async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function loadMatchdays(): Promise<MatchdayRow[]> {
  const { data, error } = await supabaseAdmin
    .from("fantasy_matchdays")
    .select("id, label, round, display_name, lock_at, status")
    .order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MatchdayRow[];
}

async function loadFixtures(): Promise<FixtureRow[]> {
  const { data, error } = await supabaseAdmin
    .from("fantasy_fixtures")
    .select(
      "provider_fixture_id, matchday_id, home_team_id, away_team_id, kickoff, status, finished_at, last_stats_sync, stats_finalized",
    );
  if (error) throw error;
  return (data ?? []).map((f) => ({
    ...f,
    provider_fixture_id: Number(f.provider_fixture_id),
    home_team_id: Number(f.home_team_id),
    away_team_id: Number(f.away_team_id),
  })) as FixtureRow[];
}

const lastKickoffMs = (fixtures: FixtureRow[]) =>
  Math.max(0, ...fixtures.map((f) => new Date(f.kickoff).getTime()));

/**
 * A matchday window is "active" from its lock until 4h after its last kickoff
 * — the span in which fixture statuses can change. Reconciliation re-pulls
 * outside this window are driven per-fixture by statsSyncDue instead.
 */
function isWindowActive(md: MatchdayRow, fixtures: FixtureRow[], now: number): boolean {
  if (md.status === "final" || md.status === "upcoming") return false;
  const mdFixtures = fixtures.filter((f) => f.matchday_id === md.id);
  if (mdFixtures.length === 0) return false;
  return now <= lastKickoffMs(mdFixtures) + ACTIVE_WINDOW_TAIL_MS;
}

type StatsPass = "live" | "post_ft" | "reconcile_final";

/** Reconciliation schedule per fixture (TRD §3): FT+15m continuous, then one
 * reconciliation pass at ≥FT+2h, after which stats freeze. */
function statsSyncDue(f: FixtureRow, now: number): StatsPass | null {
  if (f.stats_finalized) return null;
  const lastSync = f.last_stats_sync ? new Date(f.last_stats_sync).getTime() : 0;

  if (LIVE_STATUSES.has(f.status)) {
    return now - lastSync >= STATS_MIN_INTERVAL_MS ? "live" : null;
  }

  if (!FINISHED_STATUSES.has(f.status) || !f.finished_at) return null;
  const finished = new Date(f.finished_at).getTime();

  if (now >= finished + RECONCILE_FINAL_MS) {
    return lastSync < finished + RECONCILE_FINAL_MS ? "reconcile_final" : null;
  }
  if (now <= finished + POST_FT_CONTINUOUS_MS) {
    return now - lastSync >= POST_FT_MIN_INTERVAL_MS ? "post_ft" : null;
  }
  return null;
}

async function refreshFixturesFromProvider(
  matchdays: MatchdayRow[],
  now: string,
): Promise<void> {
  const knownMatchdays = new Set(matchdays.map((m) => m.id));
  const provider = await getWorldCupFixtures();
  const relevant = provider.filter((f) => knownMatchdays.has(ROUND_TO_MATCHDAY[f.round]));
  if (relevant.length === 0) return;

  const existing = await loadFixtures();
  const byId = new Map(existing.map((f) => [f.provider_fixture_id, f]));

  const rows = relevant.map((f) => {
    const prev = byId.get(f.id);
    const justFinished = FINISHED_STATUSES.has(f.status) && !prev?.finished_at;
    return {
      provider_fixture_id: f.id,
      matchday_id: ROUND_TO_MATCHDAY[f.round],
      home_team_id: f.homeTeam.id,
      away_team_id: f.awayTeam.id,
      home_team: f.homeTeam.name,
      away_team: f.awayTeam.name,
      kickoff: f.kickoff,
      status: f.status,
      home_score: f.homeScore,
      away_score: f.awayScore,
      // First observation of a finished status stamps finished_at (drives the
      // FT+15m / +2h reconciliation clocks).
      finished_at: justFinished ? now : (prev?.finished_at ?? null),
    };
  });

  const { error } = await supabaseAdmin
    .from("fantasy_fixtures")
    .upsert(rows, { onConflict: "provider_fixture_id" });
  if (error) throw error;

  // Matchdays seeded before their round's fixtures were published carry a
  // PROVISIONAL lock_at (see scripts/seed-fantasy.ts) — while still
  // 'upcoming', lock_at follows the earliest published kickoff. Never move a
  // lock into the past: that would retro-lock a round mid-build (a correct
  // past lock was already set by an earlier sync or the seed).
  for (const md of matchdays) {
    if (md.status !== "upcoming") continue;
    const kickoffs = relevant
      .filter((f) => ROUND_TO_MATCHDAY[f.round] === md.id)
      .map((f) => new Date(f.kickoff).getTime());
    if (kickoffs.length === 0) continue;
    const earliestMs = Math.min(...kickoffs);
    const earliest = new Date(earliestMs).toISOString();
    if (earliestMs > Date.now() && earliest !== new Date(md.lock_at).toISOString()) {
      const { error: lockError } = await supabaseAdmin
        .from("fantasy_matchdays")
        .update({ lock_at: earliest })
        .eq("id", md.id);
      if (lockError) throw lockError;
      md.lock_at = earliest;
    }
  }
}

async function setMatchdayStatus(id: number, status: MatchdayRow["status"]) {
  const { error } = await supabaseAdmin
    .from("fantasy_matchdays")
    .update({ status })
    .eq("id", id);
  if (error) throw error;
}

async function syncFixtureStats(
  fixture: FixtureRow,
  pass: StatsPass,
  settings: FantasySettings,
  playerPositions: Map<number, Position>,
  now: string,
): Promise<void> {
  const normalized = await getNormalizedFixtureStats(fixture.provider_fixture_id);
  const finalize = pass === "reconcile_final";

  const rows: Record<string, unknown>[] = [];
  for (const [playerId, entry] of normalized.byPlayer) {
    const position = playerPositions.get(playerId) ?? entry.position;
    if (!position) continue;
    const { points, breakdown } = computePoints(entry.stats, position, settings.scoring);
    rows.push({
      provider_fixture_id: fixture.provider_fixture_id,
      player_id: playerId,
      stats: entry.stats,
      points,
      breakdown,
      finalized: finalize,
    });
  }

  if (rows.length > 0) {
    const { error } = await supabaseAdmin
      .from("fantasy_player_match_stats")
      .upsert(rows, { onConflict: "provider_fixture_id,player_id" });
    if (error) throw error;
  }

  const { error } = await supabaseAdmin
    .from("fantasy_fixtures")
    .update({ last_stats_sync: now, ...(finalize ? { stats_finalized: true } : {}) })
    .eq("provider_fixture_id", fixture.provider_fixture_id);
  if (error) throw error;
}

/** Recompute matchday scores, participant totals and ranks (idempotent).
 * Exported for the admin restore-banked repair route. */
export async function recomputeScores(matchdayIds: number[]): Promise<number> {
  if (matchdayIds.length === 0) return 0;
  let updated = 0;

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
        : await fetchAll<{ player_id: number; points: number; stats: { minutes?: number } }>(
            (from, to) =>
              supabaseAdmin
                .from("fantasy_player_match_stats")
                .select("player_id, points, stats")
                .in("provider_fixture_id", fixtureIds)
                .range(from, to),
          );

    const playerPoints = new Map<number, { points: number; minutes: number }>();
    for (const row of statRows) {
      const id = Number(row.player_id);
      const prev = playerPoints.get(id) ?? { points: 0, minutes: 0 };
      playerPoints.set(id, {
        points: prev.points + Number(row.points),
        minutes: prev.minutes + Number(row.stats?.minutes ?? 0),
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
        xi_at_kickoff: boolean | null;
      }[];
    }>((from, to) =>
      supabaseAdmin
        .from("fantasy_squads")
        .select(
          "wallet_address, transfer_points_deduction, players:fantasy_squad_players(player_id, slot, is_captain, is_vice, xi_at_kickoff)",
        )
        .eq("matchday_id", matchdayId)
        .range(from, to),
    );

    const scoreRows = squads.map((squad) => ({
      wallet_address: squad.wallet_address,
      matchday_id: matchdayId,
      points: computeSquadPoints({
        // Points count for players who were in the XI when their fixture
        // kicked off (banked stamp); current slot only decides for fixtures
        // that haven't kicked off yet. Benching a played player keeps the
        // points they already earned.
        startingXI: (squad.players ?? [])
          .filter(countsForScoring)
          .map((p) => ({
            playerId: Number(p.player_id),
            isCaptain: p.is_captain,
            isVice: p.is_vice,
          })),
        playerPoints,
        transferPointsDeduction: squad.transfer_points_deduction,
      }),
    }));

    for (let i = 0; i < scoreRows.length; i += 500) {
      const { error } = await supabaseAdmin
        .from("fantasy_matchday_scores")
        .upsert(scoreRows.slice(i, i + 500), { onConflict: "wallet_address,matchday_id" });
      if (error) throw error;
    }
    updated += scoreRows.length;
  }

  // Participant totals = sum across ALL matchdays, then ranks from the
  // leaderboard view (O-4 tie-breakers live in SQL — single source of truth).
  const allScores = await fetchAll<{ wallet_address: string; points: number }>((from, to) =>
    supabaseAdmin
      .from("fantasy_matchday_scores")
      .select("wallet_address, points")
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
  for (let i = 0; i < pointsChanges.length; i += 20) {
    await Promise.all(
      pointsChanges.slice(i, i + 20).map(async (p) => {
        const { error } = await supabaseAdmin
          .from("fantasy_participants")
          .update({ total_points: totals.get(p.wallet_address) ?? 0 })
          .eq("wallet_address", p.wallet_address);
        if (error) throw error;
      }),
    );
  }

  const leaderboard = await fetchAll<{ wallet_address: string; rank: number }>((from, to) =>
    supabaseAdmin.from("fantasy_leaderboard").select("wallet_address, rank").range(from, to),
  );
  const currentRanks = new Map(participants.map((p) => [p.wallet_address, p.current_rank]));
  const rankChanges = leaderboard.filter(
    (r) => currentRanks.get(r.wallet_address) !== Number(r.rank),
  );
  for (let i = 0; i < rankChanges.length; i += 20) {
    await Promise.all(
      rankChanges.slice(i, i + 20).map(async (r) => {
        const { error } = await supabaseAdmin
          .from("fantasy_participants")
          .update({ current_rank: Number(r.rank) })
          .eq("wallet_address", r.wallet_address);
        if (error) throw error;
      }),
    );
  }

  return updated;
}

/**
 * live→finalizing rollover: snapshot ranks into previous_rank, clone every
 * squad into the next matchday (is_initial=false, fresh free transfers, no
 * deduction) and deactivate players from eliminated teams (TBD-safe).
 */
async function rolloverMatchday(
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
  for (let i = 0; i < snapshotTargets.length; i += 20) {
    await Promise.all(
      snapshotTargets.slice(i, i + 20).map(async (p) => {
        const { error } = await supabaseAdmin
          .from("fantasy_participants")
          .update({ previous_rank: p.current_rank })
          .eq("wallet_address", p.wallet_address);
        if (error) throw error;
      }),
    );
  }

  const next = matchdays.find((m) => m.id === finished.id + 1);
  if (!next) return;

  const freeTransfers = settings.free_transfers[matchdayLabel(next.id)] ?? 0;

  const squads = await fetchAll<{
    wallet_address: string;
    budget_spent: number;
    players: { player_id: number; slot: number; is_captain: boolean; is_vice: boolean }[];
  }>((from, to) =>
    supabaseAdmin
      .from("fantasy_squads")
      .select(
        "wallet_address, budget_spent, players:fantasy_squad_players(player_id, slot, is_captain, is_vice)",
      )
      .eq("matchday_id", finished.id)
      .range(from, to),
  );

  const { data: existingNext, error: existingError } = await supabaseAdmin
    .from("fantasy_squads")
    .select("wallet_address")
    .eq("matchday_id", next.id);
  if (existingError) throw existingError;
  const alreadyRolled = new Set((existingNext ?? []).map((s) => s.wallet_address));

  for (const squad of squads) {
    if (alreadyRolled.has(squad.wallet_address)) continue;
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("fantasy_squads")
      .insert({
        wallet_address: squad.wallet_address,
        matchday_id: next.id,
        budget_spent: squad.budget_spent,
        free_transfers_remaining: freeTransfers,
        transfer_points_deduction: 0,
        is_initial: false,
      })
      .select("id")
      .single();
    if (insertError) {
      alerts.push(`rollover: squad clone failed for ${squad.wallet_address}`);
      continue;
    }
    const { error: playersError } = await supabaseAdmin.from("fantasy_squad_players").insert(
      (squad.players ?? []).map((p) => ({
        squad_id: inserted.id,
        player_id: p.player_id,
        slot: p.slot,
        is_captain: p.is_captain,
        is_vice: p.is_vice,
      })),
    );
    if (playersError) {
      alerts.push(`rollover: squad players clone failed for ${squad.wallet_address}`);
    }
  }

  if (!(await applyEliminations(next.id))) {
    alerts.push("rollover: eliminated-team deactivation deferred (next-round teams TBD)");
  }
}

/**
 * Deactivate players whose teams have no fixture left from `minMatchdayId`
 * on (they're out of the tournament), reactivating any that do. TBD-safe:
 * a no-op (returns false) until every remaining fixture has concrete teams.
 * Runs both at rollover and while a round is upcoming — the latter catches
 * teams eliminated in the UNSCORED round before it (e.g. R16 losers must be
 * unpickable during MD6 squad building as soon as the QF bracket publishes).
 */
async function applyEliminations(minMatchdayId: number): Promise<boolean> {
  const remainingFixtures = (await loadFixtures()).filter(
    (f) => f.matchday_id >= minMatchdayId,
  );
  const tbdPending =
    remainingFixtures.length === 0 ||
    remainingFixtures.some(
      (f) => f.status === "TBD" || !f.home_team_id || !f.away_team_id,
    );
  if (tbdPending) return false;

  const remainingTeams = new Set(
    remainingFixtures.flatMap((f) => [f.home_team_id, f.away_team_id]),
  );
  const { error: deactivateError } = await supabaseAdmin
    .from("fantasy_players")
    .update({ is_active: false })
    .not("team_id", "in", `(${[...remainingTeams].join(",")})`)
    .eq("is_active", true);
  if (deactivateError) throw deactivateError;
  const { error: reactivateError } = await supabaseAdmin
    .from("fantasy_players")
    .update({ is_active: true })
    .in("team_id", [...remainingTeams])
    .eq("is_active", false);
  if (reactivateError) throw reactivateError;
  return true;
}

// ─── Referral sweep ───────────────────────────────────────────────────────────

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/**
 * Cumulative-activation sweep (PRD F-6, stakeholder decision #4): a referred
 * user activates when their TOTAL completed on/off-ramp USD-equivalent volume
 * inside [campaign_start, qualification_deadline] reaches the threshold —
 * activated_at = created_at of the crossing transaction.
 */
async function referralSweep(
  settings: FantasySettings,
): Promise<{ referred: number; activated: number }> {
  const participants = await fetchAll<{ wallet_address: string }>((from, to) =>
    supabaseAdmin.from("fantasy_participants").select("wallet_address").range(from, to),
  );
  const participantSet = new Set(participants.map((p) => p.wallet_address));
  if (participantSet.size === 0) return { referred: 0, activated: 0 };

  const referrals = await fetchAll<{
    id: string;
    referrer_wallet_address: string;
    referred_wallet_address: string;
    created_at: string;
  }>((from, to) =>
    supabaseAdmin
      .from("referrals")
      .select("id, referrer_wallet_address, referred_wallet_address, created_at")
      .gte("created_at", settings.campaign_start)
      .lte("created_at", settings.qualification_deadline)
      .order("created_at", { ascending: true })
      .range(from, to),
  );

  // First-touch: a referred wallet counts toward exactly one (earliest) referrer.
  const byReferred = new Map<string, (typeof referrals)[number]>();
  for (const r of referrals) {
    const referrer = r.referrer_wallet_address.toLowerCase();
    const referred = r.referred_wallet_address.toLowerCase();
    if (!participantSet.has(referrer)) continue;
    if (!byReferred.has(referred)) byReferred.set(referred, r);
  }
  if (byReferred.size === 0) return { referred: 0, activated: 0 };

  let activated = 0;
  const progressRows: Record<string, unknown>[] = [];

  for (const wallets of chunk([...byReferred.keys()], 50)) {
    const txs = await fetchAll<ReferralTx & { wallet_address: string }>((from, to) =>
      supabaseAdmin
        .from("transactions")
        .select(
          "wallet_address, transaction_type, from_currency, to_currency, amount_sent, amount_received, created_at",
        )
        .in("wallet_address", wallets)
        .eq("status", "completed")
        .in("transaction_type", ["onramp", "offramp"])
        .gte("created_at", settings.campaign_start)
        .lte("created_at", settings.qualification_deadline)
        .order("created_at", { ascending: true })
        .range(from, to),
    );

    const byWallet = new Map<string, typeof txs>();
    for (const tx of txs) {
      const w = tx.wallet_address.toLowerCase();
      const list = byWallet.get(w) ?? [];
      list.push(tx);
      byWallet.set(w, list);
    }

    for (const wallet of wallets) {
      const referral = byReferred.get(wallet)!;
      const { total, activatedAt } = cumulativeActivation(byWallet.get(wallet) ?? [], settings);
      if (activatedAt) activated++;
      progressRows.push({
        referred_wallet_address: wallet,
        referrer_wallet_address: referral.referrer_wallet_address.toLowerCase(),
        referral_id: referral.id,
        signed_up_at: referral.created_at,
        total_tx_usd: total,
        activated_at: activatedAt,
      });
    }
  }

  for (const rows of chunk(progressRows, 500)) {
    const { error } = await supabaseAdmin
      .from("fantasy_referral_progress")
      .upsert(rows, { onConflict: "referred_wallet_address" });
    if (error) throw error;
  }

  return { referred: progressRows.length, activated };
}

// ─── Notifications (F-14) ─────────────────────────────────────────────────────

async function emailsForWallets(wallets: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const batch of chunk(wallets, 100)) {
    const { data, error } = await supabaseAdmin
      .from("user_kyc_profiles")
      .select("wallet_address, email_address")
      .in("wallet_address", batch);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.email_address) out.set(row.wallet_address, row.email_address);
    }
  }
  return out;
}

async function sendNotifications(
  settings: FantasySettings,
  matchdays: MatchdayRow[],
  finalizedThisTick: MatchdayRow[],
  now: number,
  alerts: string[],
): Promise<{ sent: number }> {
  let sent = 0;
  const budgetLeft = () => sent < MAX_EMAILS_PER_TICK;

  const trySend = async (
    wallet: string,
    kind: "matchday_reminder" | "one_away" | "recap",
    refId: string,
    email: string,
    payload: { subject: string; html: string },
  ) => {
    if (!budgetLeft()) return;
    if (!(await claimNotification(wallet, kind, refId))) return;
    try {
      await sendFantasyEmail({ to: email, ...payload });
      sent++;
    } catch (error) {
      // Slot stays claimed — we accept a dropped email over a double-send.
      alerts.push(`email ${kind} to ${wallet} failed: ${String(error)}`);
    }
  };

  // T−24h matchday reminders.
  const reminderMd = matchdays.find((m) => {
    const lock = new Date(m.lock_at).getTime();
    return m.status === "upcoming" && now >= lock - 24 * 60 * 60_000 && now < lock;
  });
  if (reminderMd) {
    // Pre-filter wallets already claimed for this matchday's reminder so the
    // 24h window doesn't keep re-fetching + re-attempting duplicate-key
    // writes for participants notified on an earlier tick.
    const alreadyNotified = new Set(
      (
        await fetchAll<{ wallet_address: string }>((from, to) =>
          supabaseAdmin
            .from("fantasy_notifications")
            .select("wallet_address")
            .eq("kind", "matchday_reminder")
            .eq("ref_id", String(reminderMd.id))
            .range(from, to),
        )
      ).map((n) => n.wallet_address),
    );
    const participants = (
      await fetchAll<{ wallet_address: string }>((from, to) =>
        supabaseAdmin.from("fantasy_participants").select("wallet_address").range(from, to),
      )
    ).filter((p) => !alreadyNotified.has(p.wallet_address));
    if (participants.length > 0) {
      const emails = await emailsForWallets(participants.map((p) => p.wallet_address));
      const payload = matchdayReminderEmail(reminderMd.display_name, reminderMd.lock_at);
      for (const [wallet, email] of emails) {
        if (!budgetLeft()) break;
        await trySend(wallet, "matchday_reminder", String(reminderMd.id), email, payload);
      }
    }
  }

  // "One away" from qualifying.
  if (now <= new Date(settings.qualification_deadline).getTime()) {
    const rows = await fetchAll<{ wallet_address: string; activated_referrals: number }>(
      (from, to) =>
        supabaseAdmin
          .from("fantasy_qualification")
          .select("wallet_address, activated_referrals")
          .eq("activated_referrals", settings.referrals_required - 1)
          .range(from, to),
    );
    if (rows.length > 0) {
      const emails = await emailsForWallets(rows.map((r) => r.wallet_address));
      for (const row of rows) {
        if (!budgetLeft()) break;
        const email = emails.get(row.wallet_address);
        if (!email) continue;
        await trySend(
          row.wallet_address,
          "one_away",
          "qualification",
          email,
          oneAwayEmail(Number(row.activated_referrals), settings.referrals_required),
        );
      }
    }
  }

  // Matchday recap once a round goes final.
  for (const md of finalizedThisTick) {
    const scores = await fetchAll<{ wallet_address: string; points: number }>((from, to) =>
      supabaseAdmin
        .from("fantasy_matchday_scores")
        .select("wallet_address, points")
        .eq("matchday_id", md.id)
        .range(from, to),
    );
    const ranks = new Map(
      (
        await fetchAll<{ wallet_address: string; current_rank: number | null }>((from, to) =>
          supabaseAdmin
            .from("fantasy_participants")
            .select("wallet_address, current_rank")
            .range(from, to),
        )
      ).map((p) => [p.wallet_address, p.current_rank]),
    );
    const emails = await emailsForWallets(scores.map((s) => s.wallet_address));
    for (const score of scores) {
      if (!budgetLeft()) break;
      const email = emails.get(score.wallet_address);
      if (!email) continue;
      await trySend(
        score.wallet_address,
        "recap",
        String(md.id),
        email,
        recapEmail(md.display_name, Number(score.points), ranks.get(score.wallet_address) ?? null),
      );
    }
  }

  return { sent };
}

// ─── Tick orchestration ───────────────────────────────────────────────────────

let tickRunning = false;

export async function runWorkerTick(options?: { force?: boolean }): Promise<WorkerReport> {
  const force = options?.force ?? false;
  const nowDate = new Date();
  const now = nowDate.getTime();
  const nowIso = nowDate.toISOString();
  const minute = nowDate.getUTCMinutes();

  const report: WorkerReport = {
    ran_at: nowIso,
    live_window_active: false,
    fixtures_refreshed: false,
    transitions: [],
    kickoff_stamps: 0,
    stats_synced: 0,
    fixtures_finalized: 0,
    scores_recomputed: 0,
    rolled_over_to: null,
    referral_sweep: "skipped",
    notifications: "skipped",
    provider_rate_limit: getProviderRateLimit(),
    alerts: [],
  };

  // Best-effort overlap guard (per serverless instance).
  if (tickRunning) {
    report.alerts.push("previous tick still running — skipped");
    return report;
  }
  tickRunning = true;

  try {
    const settings = await getFantasySettings();
    let matchdays = await loadMatchdays();
    if (matchdays.length === 0) {
      report.alerts.push("no matchdays seeded — run scripts/seed-fantasy.ts");
      return report;
    }
    let fixtures = await loadFixtures();

    // 1. Clock-based transition: upcoming → live once lock_at passes.
    for (const md of matchdays) {
      if (md.status === "upcoming" && now >= new Date(md.lock_at).getTime()) {
        await setMatchdayStatus(md.id, "live");
        md.status = "live";
        report.transitions.push(`MD${md.id}: upcoming→live`);
      }
    }

    // 2. Fixture refresh (provider-frugal).
    const anyActive = matchdays.some((md) => isWindowActive(md, fixtures, now));
    report.live_window_active = anyActive;
    const anyUpcoming = matchdays.some((md) => md.status === "upcoming");
    const refreshDue =
      force || anyActive || (anyUpcoming && minute % FIXTURE_REFRESH_MINUTES === 0);
    if (refreshDue) {
      try {
        await refreshFixturesFromProvider(matchdays, nowIso);
        report.fixtures_refreshed = true;
        fixtures = await loadFixtures();

        // Pre-round eliminations: as soon as the upcoming round's bracket is
        // fully published, players from teams knocked out in the previous
        // (unscored) round become unpickable.
        const current = matchdays.find((md) => md.status !== "final");
        if (current?.status === "upcoming") {
          try {
            // Idempotent; a no-op until the round's bracket fully publishes.
            await applyEliminations(current.id);
          } catch (error) {
            report.alerts.push(`elimination sync failed: ${String(error)}`);
          }
        }
      } catch (error) {
        report.alerts.push(`fixture refresh failed: ${String(error)}`);
      }
    }

    // 3. Per-fixture stats sync + reconciliation.
    const dueFixtures = fixtures
      .map((f) => ({ fixture: f, pass: statsSyncDue(f, now) }))
      .filter((d): d is { fixture: FixtureRow; pass: StatsPass } => d.pass !== null);
    const statsSyncedMatchdays = new Set<number>();
    if (dueFixtures.length > 0) {
      const playersMap = await getPlayersMap();
      const positions = new Map(
        [...playersMap.entries()].map(([id, p]) => [id, p.position] as const),
      );
      for (const { fixture, pass } of dueFixtures) {
        try {
          await syncFixtureStats(fixture, pass, settings, positions, nowIso);
          report.stats_synced++;
          statsSyncedMatchdays.add(fixture.matchday_id);
          if (pass === "reconcile_final") report.fixtures_finalized++;
        } catch (error) {
          report.alerts.push(
            `stats sync failed for fixture ${fixture.provider_fixture_id} (${pass}): ${String(error)}`,
          );
        }
      }
      fixtures = await loadFixtures();
    }

    // 3.5 Bank XI membership at kickoff (fairness): stamp squad players of
    // teams whose fixture has kicked off so later bench moves can't erase
    // points already earned in the XI. Row-idempotent (NULL-only stamping),
    // and DB-cheap once a round is fully stamped (0-row updates) — so this
    // runs on every tick a non-final matchday has kicked-off fixtures, not
    // just inside the active window, so late bench moves during a long
    // 'finalizing' tail can't dodge the stamp. Matchdays whose stamps
    // changed are rescored below — that's also what folds the migration's
    // amnesty backfill into the leaderboard automatically on the first tick
    // after deploy.
    const stampedMatchdays = new Set<number>();
    for (const md of matchdays) {
      if (md.status === "final") continue;
      const kickedOffTeams = [
        ...new Set(
          fixtures
            .filter(
              (f) =>
                f.matchday_id === md.id &&
                (LIVE_STATUSES.has(f.status) ||
                  FINISHED_STATUSES.has(f.status) ||
                  new Date(f.kickoff).getTime() <= now),
            )
            .flatMap((f) => [f.home_team_id, f.away_team_id]),
        ),
      ].filter(Boolean);
      if (kickedOffTeams.length === 0) continue;
      const { data: stamped, error } = await supabaseAdmin.rpc(
        "fantasy_stamp_kickoff",
        { p_matchday_id: md.id, p_team_ids: kickedOffTeams },
      );
      if (error) {
        report.alerts.push(`kickoff stamp failed for MD${md.id}: ${String(error.message)}`);
        continue;
      }
      if (Number(stamped ?? 0) > 0) {
        report.kickoff_stamps += Number(stamped);
        stampedMatchdays.add(md.id);
      }
    }

    // 4. Status-based transitions from fresh fixture state.
    const finalizedThisTick: MatchdayRow[] = [];
    for (const md of matchdays) {
      const mdFixtures = fixtures.filter((f) => f.matchday_id === md.id);
      if (mdFixtures.length === 0) continue;

      if (md.status === "live" && mdFixtures.every((f) => FINISHED_STATUSES.has(f.status))) {
        await setMatchdayStatus(md.id, "finalizing");
        md.status = "finalizing";
        report.transitions.push(`MD${md.id}: live→finalizing`);
        try {
          await rolloverMatchday(md, matchdays, settings, report.alerts);
          report.rolled_over_to = matchdays.find((m) => m.id === md.id + 1)?.id ?? null;
        } catch (error) {
          report.alerts.push(`rollover after MD${md.id} failed: ${String(error)}`);
        }
      }

      if (md.status === "finalizing" && mdFixtures.every((f) => f.stats_finalized)) {
        await setMatchdayStatus(md.id, "final");
        md.status = "final";
        finalizedThisTick.push(md);
        report.transitions.push(`MD${md.id}: finalizing→final`);
      }
    }

    // 5. Scores + ranks whenever stats or statuses moved. Matchdays whose
    // fixtures just synced are always included — even while 'upcoming'
    // (possible when a round was seeded mid-play, e.g. R16 test mode; in a
    // normal campaign an upcoming round has no stats, so this is a no-op).
    const scoreTargets = [
      ...new Set([
        ...matchdays
          .filter(
            (md) =>
              md.status === "live" ||
              md.status === "finalizing" ||
              finalizedThisTick.some((f) => f.id === md.id),
          )
          .map((md) => md.id),
        ...statsSyncedMatchdays,
        ...stampedMatchdays,
        // Forced ticks always recompute the current round (manual ops).
        ...(force
          ? matchdays.filter((md) => md.status !== "final").slice(0, 1).map((md) => md.id)
          : []),
      ]),
    ];
    if (
      report.stats_synced > 0 ||
      report.transitions.length > 0 ||
      stampedMatchdays.size > 0 ||
      force
    ) {
      try {
        report.scores_recomputed = await recomputeScores(scoreTargets);
      } catch (error) {
        report.alerts.push(`score recompute failed: ${String(error)}`);
      }
    }

    // 6. Referral sweep (DB-only) every 5 minutes.
    if (force || minute % REFERRAL_SWEEP_MINUTES === 0) {
      try {
        report.referral_sweep = await referralSweep(settings);
      } catch (error) {
        report.alerts.push(`referral sweep failed: ${String(error)}`);
      }
    }

    // 7. Emails (feature-gated).
    if (settings.features.emails && isEmailConfigured()) {
      try {
        report.notifications = await sendNotifications(
          settings,
          matchdays,
          finalizedThisTick,
          now,
          report.alerts,
        );
      } catch (error) {
        report.alerts.push(`notifications failed: ${String(error)}`);
      }
    }

    report.provider_rate_limit = getProviderRateLimit();
    const { remaining } = report.provider_rate_limit;
    if (remaining !== null && remaining < 20) {
      report.alerts.push(`provider rate limit low: ${remaining} calls remaining today`);
    }

    return report;
  } finally {
    tickRunning = false;
  }
}
