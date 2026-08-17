import { supabaseAdmin } from "../../supabase";
import {
  applyBonusToResult,
  awardBonusPoints,
  computeNmbScore,
  winningGoalScorerId,
} from "../bonus";
import { computePoints } from "../scoring";
import {
  FINISHED_STATUSES,
  LIVE_STATUSES,
  getFixtureEvents,
  getNormalizedFixtureStats,
  getLeagueFixtures,
  goalScorerOrdersFromEvents,
  mapPositionOrMid,
  roundToMatchdayId,
} from "../provider";
import { getFantasySettings } from "../settings";
import type { MatchdayRow } from "../server";
import { fetchAll } from "../pagination";
import type {
  FantasySettings,
  FixtureRow,
  PlayerMatchStats,
  Position,
  StatsPass,
} from "../types";

const STATS_MIN_INTERVAL_MS = 90_000;
const DEADLINE_LEAD_MS = 90 * 60_000;
const DEADLINE_FREEZE_MS = 24 * 60 * 60_000;
/** Must match scripts/seed-fantasy.ts TIMELAPSE_FIXTURE_BASE. */
const TIMELAPSE_FIXTURE_BASE = 9_100_000;
/** Wall-clock match length for timelapse fixtures (maps to 90' of play). */
const TIMELAPSE_MATCH_MS = 90 * 60_000;
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

// ─── Season-scoped loads ──────────────────────────────────────────────────────

export async function loadMatchdays(settings: FantasySettings): Promise<MatchdayRow[]> {
  const { data, error } = await supabaseAdmin
    .from("fantasy_matchdays")
    .select("id, label, round, display_name, lock_at, status")
    .gte("id", settings.season_matchday_min)
    .lte("id", settings.season_matchday_max)
    .order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MatchdayRow[];
}

export async function loadFixtures(settings: FantasySettings): Promise<FixtureRow[]> {
  return (
    await fetchAll<FixtureRow>((from, to) =>
      supabaseAdmin
        .from("fantasy_fixtures")
        .select(
          "provider_fixture_id, matchday_id, home_team_id, away_team_id, kickoff, status, finished_at, last_stats_sync, stats_finalized",
        )
        .gte("matchday_id", settings.season_matchday_min)
        .lte("matchday_id", settings.season_matchday_max)
        .range(from, to),
    )
  ).map((f) => ({
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
export function isWindowActive(md: MatchdayRow, fixtures: FixtureRow[], now: number): boolean {
  if (md.status === "final" || md.status === "upcoming") return false;
  const mdFixtures = fixtures.filter((f) => f.matchday_id === md.id);
  if (mdFixtures.length === 0) return false;
  return now <= lastKickoffMs(mdFixtures) + ACTIVE_WINDOW_TAIL_MS;
}

/** Reconciliation schedule per fixture (TRD §3): FT+15m continuous, then one
 * reconciliation pass at ≥FT+2h, after which stats freeze. */
export function statsSyncDue(f: FixtureRow, now: number): StatsPass | null {
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

export function isTimelapseFixtureId(id: number): boolean {
  return id >= TIMELAPSE_FIXTURE_BASE && id < TIMELAPSE_FIXTURE_BASE + 100_000;
}

function emptyMatchStats(): PlayerMatchStats {
  return {
    minutes: 0,
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    ownGoals: 0,
    penaltiesMissed: 0,
    penaltiesScored: 0,
    penaltiesCommitted: 0,
    penaltiesSaved: 0,
    saves: 0,
    goalsConceded: 0,
    tackles: 0,
    blocks: 0,
    interceptions: 0,
    keyPasses: 0,
    shotsTotal: 0,
    shotsOnTarget: 0,
    passesTotal: 0,
    passesAccuracy: 0,
    dribblesSuccess: 0,
    foulsDrawn: 0,
    foulsCommitted: 0,
    offsides: 0,
    cleanSheet: false,
  };
}

/** Tiny deterministic PRNG so the same fixture always yields the same scoreline. */
function timelapseRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function timelapseScoreline(fixtureId: number): { home: number; away: number } {
  const rand = timelapseRng(fixtureId);
  return { home: Math.floor(rand() * 4), away: Math.floor(rand() * 3) };
}

function pickTimelapseXi(
  players: { id: number; position: Position }[],
): { id: number; position: Position }[] {
  const byPos = (pos: Position, n: number) =>
    players.filter((p) => p.position === pos).slice(0, n);
  const xi = [
    ...byPos("GK", 1),
    ...byPos("DEF", 4),
    ...byPos("MID", 4),
    ...byPos("FWD", 2),
  ];
  if (xi.length >= 11) return xi.slice(0, 11);
  // Fill from remainder if a club is short at a position.
  const used = new Set(xi.map((p) => p.id));
  for (const p of players) {
    if (xi.length >= 11) break;
    if (!used.has(p.id)) xi.push(p);
  }
  return xi;
}

/**
 * Clock-advance synthetic fixtures: NS → 1H → HT → 2H → FT, and set scores at FT.
 * Returns how many rows were updated.
 */
export async function advanceTimelapseFixtures(
  fixtures: FixtureRow[],
  now: number,
): Promise<number> {
  let changed = 0;
  for (const f of fixtures) {
    if (!isTimelapseFixtureId(f.provider_fixture_id) || f.stats_finalized) continue;
    const ko = new Date(f.kickoff).getTime();
    const elapsed = now - ko;
    let nextStatus = f.status;
    let finishedAt = f.finished_at;
    let homeScore: number | null = null;
    let awayScore: number | null = null;

    if (elapsed < 0) {
      nextStatus = "NS";
    } else if (elapsed < TIMELAPSE_MATCH_MS * (45 / 90)) {
      nextStatus = "1H";
    } else if (elapsed < TIMELAPSE_MATCH_MS * (50 / 90)) {
      nextStatus = "HT";
    } else if (elapsed < TIMELAPSE_MATCH_MS) {
      nextStatus = "2H";
    } else {
      nextStatus = "FT";
      if (!finishedAt) finishedAt = new Date(ko + TIMELAPSE_MATCH_MS).toISOString();
      const score = timelapseScoreline(f.provider_fixture_id);
      homeScore = score.home;
      awayScore = score.away;
    }

    if (nextStatus === f.status && (nextStatus !== "FT" || f.finished_at)) continue;

    const patch: Record<string, unknown> = { status: nextStatus };
    if (finishedAt && !f.finished_at) patch.finished_at = finishedAt;
    if (homeScore != null) {
      patch.home_score = homeScore;
      patch.away_score = awayScore;
    }
    const { error } = await supabaseAdmin
      .from("fantasy_fixtures")
      .update(patch)
      .eq("provider_fixture_id", f.provider_fixture_id);
    if (error) throw error;
    f.status = nextStatus;
    if (finishedAt) f.finished_at = finishedAt;
    changed++;
  }
  return changed;
}

export async function syncTimelapseFixtureStats(
  fixture: FixtureRow,
  pass: StatsPass,
  settings: FantasySettings,
  now: string,
): Promise<void> {
  const finalize = pass === "reconcile_final";
  const { data: fxMeta, error: fxErr } = await supabaseAdmin
    .from("fantasy_fixtures")
    .select("home_score, away_score, home_team_id, away_team_id, kickoff")
    .eq("provider_fixture_id", fixture.provider_fixture_id)
    .maybeSingle();
  if (fxErr) throw fxErr;

  const homeId = Number(fxMeta?.home_team_id ?? fixture.home_team_id);
  const awayId = Number(fxMeta?.away_team_id ?? fixture.away_team_id);
  const score = timelapseScoreline(fixture.provider_fixture_id);
  const homeScore = Number(fxMeta?.home_score ?? score.home);
  const awayScore = Number(fxMeta?.away_score ?? score.away);

  const { data: teamPlayers, error: plErr } = await supabaseAdmin
    .from("fantasy_players")
    .select("provider_player_id, team_id, position")
    .in("team_id", [homeId, awayId])
    .eq("is_active", true);
  if (plErr) throw plErr;

  const homePool = (teamPlayers ?? [])
    .filter((p) => Number(p.team_id) === homeId)
    .map((p) => ({
      id: Number(p.provider_player_id),
      position: mapPositionOrMid(p.position as Position),
    }));
  const awayPool = (teamPlayers ?? [])
    .filter((p) => Number(p.team_id) === awayId)
    .map((p) => ({
      id: Number(p.provider_player_id),
      position: mapPositionOrMid(p.position as Position),
    }));

  const homeXi = pickTimelapseXi(homePool);
  const awayXi = pickTimelapseXi(awayPool);

  const ko = new Date(fxMeta?.kickoff ?? fixture.kickoff).getTime();
  const nowMs = new Date(now).getTime();
  let matchMinutes = 0;
  if (FINISHED_STATUSES.has(fixture.status)) {
    matchMinutes = 90;
  } else if (LIVE_STATUSES.has(fixture.status)) {
    matchMinutes = Math.max(
      1,
      Math.min(90, Math.floor(((nowMs - ko) / TIMELAPSE_MATCH_MS) * 90)),
    );
  }

  const rand = timelapseRng(fixture.provider_fixture_id * 31);
  const assignGoals = (
    xi: { id: number; position: Position }[],
    goals: number,
  ): Map<number, number> => {
    const out = new Map<number, number>();
    const scorers = xi.filter((p) => p.position !== "GK");
    for (let g = 0; g < goals && scorers.length > 0; g++) {
      const pick = scorers[Math.floor(rand() * scorers.length)];
      out.set(pick.id, (out.get(pick.id) ?? 0) + 1);
    }
    return out;
  };
  const homeGoals = assignGoals(homeXi, homeScore);
  const awayGoals = assignGoals(awayXi, awayScore);

  // Winning-goal scorer = last goal on the winning side (simple NMB hook).
  let winScorer: number | null = null;
  if (homeScore > awayScore && homeXi.length) {
    const scorers = [...homeGoals.entries()].flatMap(([id, n]) => Array(n).fill(id));
    winScorer = scorers[scorers.length - 1] ?? homeXi.find((p) => p.position === "MID")?.id ?? null;
  } else if (awayScore > homeScore && awayXi.length) {
    const scorers = [...awayGoals.entries()].flatMap(([id, n]) => Array(n).fill(id));
    winScorer = scorers[scorers.length - 1] ?? awayXi.find((p) => p.position === "MID")?.id ?? null;
  }

  const buildSide = (
    xi: { id: number; position: Position }[],
    goalsFor: Map<number, number>,
    conceded: number,
  ) => {
    const accrued: {
      playerId: number;
      basePoints: number;
      breakdown: { reason: string; points: number }[];
      nmb: number;
      stats: PlayerMatchStats;
    }[] = [];
    for (const [idx, p] of xi.entries()) {
      const stats = emptyMatchStats();
      // Bench-ish last name sometimes DNPs for auto-sub demos.
      const plays = idx < 10 || matchMinutes >= 70;
      stats.minutes = plays ? matchMinutes : 0;
      if (stats.minutes <= 0) {
        accrued.push({
          playerId: p.id,
          stats,
          basePoints: 0,
          breakdown: [],
          nmb: 0,
        });
        continue;
      }
      stats.goals = goalsFor.get(p.id) ?? 0;
      if (idx === 2 && stats.goals === 0 && rand() > 0.55) stats.assists = 1;
      stats.goalsConceded = conceded;
      stats.cleanSheet = stats.minutes >= 60 && conceded === 0;
      if (p.position === "GK") {
        stats.saves = 2 + Math.floor(rand() * 4);
        if (rand() > 0.85) stats.penaltiesSaved = 1;
      } else if (p.position === "DEF") {
        stats.tackles = 1 + Math.floor(rand() * 4);
        stats.blocks = Math.floor(rand() * 3);
        stats.interceptions = Math.floor(rand() * 3);
      } else {
        stats.tackles = Math.floor(rand() * 3);
        stats.interceptions = Math.floor(rand() * 2);
        stats.keyPasses = Math.floor(rand() * 3);
        stats.shotsOnTarget = stats.goals + Math.floor(rand() * 2);
      }
      if (rand() > 0.92) stats.yellowCards = 1;
      stats.passesTotal = 20 + Math.floor(rand() * 40);
      stats.passesAccuracy = 70 + Math.floor(rand() * 25);

      const { points, breakdown } = computePoints(
        stats,
        p.position,
        settings.scoring,
        settings,
      );
      const nmb = computeNmbScore(p.position, stats, {
        isWinningGoalScorer: winScorer === p.id,
      });
      accrued.push({ playerId: p.id, stats, basePoints: points, breakdown, nmb });
    }
    return accrued;
  };

  const accrued = [
    ...buildSide(homeXi, homeGoals, awayScore),
    ...buildSide(awayXi, awayGoals, homeScore),
  ];

  const bonusMap = awardBonusPoints(
    accrued.map((a) => ({ playerId: a.playerId, nmb: a.nmb, minutes: a.stats.minutes })),
  );
  const rows: Record<string, unknown>[] = accrued.map((a) => {
    const bonus = bonusMap.get(a.playerId) ?? 0;
    const merged = applyBonusToResult(a.basePoints, a.breakdown, bonus);
    return {
      provider_fixture_id: fixture.provider_fixture_id,
      player_id: a.playerId,
      stats: a.stats,
      points: merged.points,
      breakdown: merged.breakdown,
      finalized: finalize,
    };
  });

  if (rows.length > 0) {
    const { error } = await supabaseAdmin
      .from("fantasy_player_match_stats")
      .upsert(rows, { onConflict: "provider_fixture_id,player_id" });
    if (error) throw error;
  }

  const { error } = await supabaseAdmin
    .from("fantasy_fixtures")
    .update({
      last_stats_sync: now,
      home_score: homeScore,
      away_score: awayScore,
      ...(finalize ? { stats_finalized: true } : {}),
    })
    .eq("provider_fixture_id", fixture.provider_fixture_id);
  if (error) throw error;
}

export async function refreshFixturesFromProvider(
  matchdays: MatchdayRow[],
  now: string,
  alerts: string[],
): Promise<void> {
  const knownMatchdays = new Set(matchdays.map((m) => m.id));
  const provider = await getLeagueFixtures();
  const relevant = provider.filter((f) => {
    const id = roundToMatchdayId(f.round);
    return id != null && knownMatchdays.has(id);
  });
  if (relevant.length === 0) return;

  const settings = await getFantasySettings();
  const existing = await loadFixtures(settings);
  const byId = new Map(existing.map((f) => [f.provider_fixture_id, f]));

  const rows = relevant.map((f) => {
    const prev = byId.get(f.id);
    const justFinished = FINISHED_STATUSES.has(f.status) && !prev?.finished_at;
    return {
      provider_fixture_id: f.id,
      matchday_id: roundToMatchdayId(f.round)!,
      home_team_id: f.homeTeam.id,
      away_team_id: f.awayTeam.id,
      home_team: f.homeTeam.name,
      away_team: f.awayTeam.name,
      kickoff: f.kickoff,
      status: f.status,
      home_score: f.homeScore,
      away_score: f.awayScore,
      finished_at: justFinished ? now : (prev?.finished_at ?? null),
    };
  });

  const { error } = await supabaseAdmin
    .from("fantasy_fixtures")
    .upsert(rows, { onConflict: "provider_fixture_id" });
  if (error) throw error;

  // lock_at = earliest kickoff − 90m. 24h freeze: never move earlier once inside freeze.
  for (const md of matchdays) {
    if (md.status !== "upcoming") continue;
    const kickoffs = relevant
      .filter((f) => roundToMatchdayId(f.round) === md.id)
      .map((f) => new Date(f.kickoff).getTime());
    if (kickoffs.length === 0) continue;
    const earliestMs = Math.min(...kickoffs);
    const proposed = earliestMs - DEADLINE_LEAD_MS;
    const currentLock = new Date(md.lock_at).getTime();
    const nowMs = Date.now();
    if (nowMs >= currentLock - DEADLINE_FREEZE_MS) {
      for (const ko of kickoffs) {
        if (ko < currentLock) {
          alerts.push(
            `GW ${md.id}: fixture kickoff precedes frozen lock_at (${md.lock_at})`,
          );
        }
      }
      continue; // frozen — never move lock earlier
    }
    if (proposed > nowMs && proposed !== currentLock) {
      const lockAt = new Date(proposed).toISOString();
      const { error: lockError } = await supabaseAdmin
        .from("fantasy_matchdays")
        .update({ lock_at: lockAt })
        .eq("id", md.id);
      if (lockError) throw lockError;
      md.lock_at = lockAt;
    }
  }
}

/** Alert when a fixture kickoff lands before a frozen deadline (postponement risk). */
export function checkFrozenDeadlinePostponements(
  matchdays: MatchdayRow[],
  fixtures: FixtureRow[],
  nowMs: number,
  alerts: string[],
): void {
  for (const md of matchdays) {
    if (md.status !== "upcoming" && md.status !== "live") continue;
    const lockMs = new Date(md.lock_at).getTime();
    if (nowMs < lockMs - DEADLINE_FREEZE_MS) continue;
    for (const f of fixtures) {
      if (f.matchday_id !== md.id) continue;
      if (new Date(f.kickoff).getTime() < lockMs) {
        alerts.push(
          `fixture ${f.provider_fixture_id} kickoff precedes frozen lock_at for GW ${md.id}`,
        );
      }
    }
  }
}

export async function setMatchdayStatus(id: number, status: MatchdayRow["status"]) {
  const { error } = await supabaseAdmin
    .from("fantasy_matchdays")
    .update({ status })
    .eq("id", id);
  if (error) throw error;
}

export async function syncFixtureStats(
  fixture: FixtureRow,
  pass: StatsPass,
  settings: FantasySettings,
  playerPositions: Map<number, Position>,
  now: string,
): Promise<void> {
  const [normalized, events, fixtureMeta] = await Promise.all([
    getNormalizedFixtureStats(fixture.provider_fixture_id),
    getFixtureEvents(fixture.provider_fixture_id),
    supabaseAdmin
      .from("fantasy_fixtures")
      .select("home_score, away_score, home_team_id, away_team_id")
      .eq("provider_fixture_id", fixture.provider_fixture_id)
      .maybeSingle(),
  ]);
  if (fixtureMeta.error) throw fixtureMeta.error;
  const finalize = pass === "reconcile_final";

  const homeId = Number(fixtureMeta.data?.home_team_id ?? fixture.home_team_id);
  const awayId = Number(fixtureMeta.data?.away_team_id ?? fixture.away_team_id);
  const homeScore = Number(fixtureMeta.data?.home_score ?? 0);
  const awayScore = Number(fixtureMeta.data?.away_score ?? 0);
  const orders = goalScorerOrdersFromEvents(events, homeId, awayId);
  const winScorer = winningGoalScorerId(
    homeId,
    awayId,
    homeScore,
    awayScore,
    orders.home,
    orders.away,
  );

  const accrued: {
    playerId: number;
    basePoints: number;
    breakdown: { reason: string; points: number }[];
    nmb: number;
    stats: PlayerMatchStats;
  }[] = [];

  for (const [playerId, entry] of normalized.byPlayer) {
    const position = mapPositionOrMid(playerPositions.get(playerId) ?? entry.position);
    const { points, breakdown } = computePoints(
      entry.stats,
      position,
      settings.scoring,
      settings,
    );
    const nmb = computeNmbScore(position, entry.stats, {
      isWinningGoalScorer: winScorer === playerId,
    });
    accrued.push({
      playerId,
      stats: entry.stats,
      basePoints: points,
      breakdown,
      nmb,
    });
  }

  const bonusMap = awardBonusPoints(
    accrued.map((a) => ({ playerId: a.playerId, nmb: a.nmb, minutes: a.stats.minutes })),
  );

  const rows: Record<string, unknown>[] = accrued.map((a) => {
    const bonus = bonusMap.get(a.playerId) ?? 0;
    const merged = applyBonusToResult(a.basePoints, a.breakdown, bonus);
    return {
      provider_fixture_id: fixture.provider_fixture_id,
      player_id: a.playerId,
      stats: a.stats,
      points: merged.points,
      breakdown: merged.breakdown,
      finalized: finalize,
    };
  });

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
