/**
 * Noblocks Play — fantasy league seed script (EPL 2025/26 season).
 *
 * Seeds `fantasy_matchdays` (GW1–GW38 → ids 101–138), `fantasy_fixtures`
 * and `fantasy_players` from API-Football (Premier League: league=39, season=2026).
 *
 * Usage (from noblocks/):
 *   SUPABASE_URL=… SUPABASE_SECRET_KEY=… API_FOOTBALL_KEY=… pnpm seed:fantasy
 *
 * Idempotent: matchdays/fixtures/players are upserted; a matchday's
 * status/lock_at are never overwritten once the row has left 'upcoming'.
 *
 * Optional env:
 *   SEED_SKIP_PLAYERS=true  — skip squad/ratings fetching on re-runs
 *   SEED_DELAY_MS=300       — pause between per-team API calls (default 300)
 *   SEED_TIMELAPSE_HOURS=48 — LOCAL ONLY: pack SEED_TIMELAPSE_GWS into a wall-clock
 *                             window (synthetic fixtures + compressed lock_at).
 *                             Pair with FANTASY_LOCAL_TIMELAPSE=true on the app.
 *   SEED_TIMELAPSE_GWS=4    — how many gameweeks to pack (default 4 → ids 101–104)
 *
 * NOTE: this script deliberately does NOT import app/lib/fantasy/provider.ts —
 * that module imports "server-only", which throws outside the Next.js runtime.
 * Constants and fetch helpers below mirror provider.ts (EPL_LEAGUE_ID, round
 * parsing, POSITION_MAP, ratings pagination). Player photos are stored;
 * photo_url may be stored from the provider but production keeps
 * photos_enabled=false and the UI renders stylized kits instead.
 */

import { createClient } from "@supabase/supabase-js";

// ─── Env ──────────────────────────────────────────────────────────────────────

function requiredEnv(name: string, fallback?: string): string {
  const value = process.env[name] || (fallback ? process.env[fallback] : undefined);
  if (!value) {
    console.error(`Missing required env ${name}`);
    process.exit(1);
  }
  return value;
}

const SUPABASE_URL = requiredEnv("SUPABASE_URL");
const SUPABASE_SECRET_KEY = requiredEnv("SUPABASE_SECRET_KEY");
// provider.ts reads both spellings; mirror that here.
const API_FOOTBALL_KEY = requiredEnv("API_FOOTBALL_KEY", "api_football_key");

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

// ─── API-Football constants (mirrors app/lib/fantasy/provider.ts) ─────────────

const BASE_URL = "https://v3.football.api-sports.io";
const EPL_LEAGUE_ID = 39;
const EPL_SEASON = 2026;
/** Matchday ids are 100 + gameweek (GW1 → 101). */
const EPL_MATCHDAY_OFFSET = 100;
const TOTAL_GAMEWEEKS = 38;

const SKIP_PLAYERS = (process.env.SEED_SKIP_PLAYERS ?? "").toLowerCase() === "true";
const SEED_DELAY_MS = Number(process.env.SEED_DELAY_MS ?? 300);
const TIMELAPSE_HOURS = Number(process.env.SEED_TIMELAPSE_HOURS ?? 0);
const TIMELAPSE_GWS = Math.max(1, Math.min(8, Number(process.env.SEED_TIMELAPSE_GWS ?? 4)));
/** Synthetic fixture id base — outside API-Football space so the worker won't clash. */
const TIMELAPSE_FIXTURE_BASE = 9_100_000;

/** FPL deadline = earliest GW kickoff minus 90 minutes. */
const DEADLINE_LEAD_MS = 90 * 60_000;
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const ALL_MATCHDAY_IDS = Array.from(
  { length: TOTAL_GAMEWEEKS },
  (_, i) => EPL_MATCHDAY_OFFSET + i + 1,
);

type Position = "GK" | "DEF" | "MID" | "FWD";

const POSITION_MAP: Record<string, Position> = {
  Goalkeeper: "GK",
  G: "GK",
  Defender: "DEF",
  D: "DEF",
  Midfielder: "MID",
  M: "MID",
  Attacker: "FWD",
  F: "FWD",
};

function mapPosition(raw: string | null): Position | null {
  if (!raw) return null;
  return POSITION_MAP[raw] ?? null;
}

/** Null / unknown provider positions default to MID (mapPositionOrMid semantics). */
function mapPositionOrMid(raw: string | null): Position {
  return mapPosition(raw) ?? "MID";
}

/** Parse API-Football round e.g. "Regular Season - 12" → matchday id 112. */
function roundToMatchdayId(round: string): number | null {
  const m = /Regular Season\s*-\s*(\d+)/i.exec(round);
  if (!m) return null;
  const gw = Number(m[1]);
  if (!Number.isFinite(gw) || gw < 1 || gw > TOTAL_GAMEWEEKS) return null;
  return EPL_MATCHDAY_OFFSET + gw;
}

function matchdayMeta(gw: number): { label: string; round: string; displayName: string } {
  return {
    label: `GW${gw}`,
    round: `Regular Season - ${gw}`,
    displayName: `Gameweek ${gw}`,
  };
}

// Heuristic price seed — FPL-ish £4.0–£14.0 curve for ~600 players on £100m budget.
const BASE_PRICE: Record<Position, number> = { GK: 4.5, DEF: 5.0, MID: 5.5, FWD: 6.0 };
const PRICE_MIN = 4.0;
const PRICE_MAX = 14.0;

function heuristicPrice(
  position: Position,
  rating: number | null,
  goals: number | null,
  appearances: number | null,
): number {
  let price = BASE_PRICE[position];
  if (rating != null) price += (rating - 6.5) * 2.5; // missing rating → base
  price += (goals ?? 0) * 0.3;
  price += (appearances ?? 0) * 0.1;
  price = Math.round(price * 2) / 2; // nearest 0.5
  return Math.min(PRICE_MAX, Math.max(PRICE_MIN, price));
}

// ─── Raw provider shapes (only the fields we read) ────────────────────────────

interface RawFixture {
  fixture: { id: number; date: string; status: { short: string } };
  league: { round: string };
  teams: {
    home: { id: number | null; name: string | null };
    away: { id: number | null; name: string | null };
  };
  goals: { home: number | null; away: number | null };
}

interface RawTeam {
  team: { id: number; name: string };
}

interface RawSquad {
  team: { id: number; name: string };
  players: { id: number; name: string; position: string; photo: string | null }[];
}

interface RawPlayerWithStats {
  player: { id: number; name: string; photo: string | null };
  statistics: {
    team: { id: number };
    games: { position: string | null; rating: string | null; appearences: number | null };
    goals: { total: number | null };
  }[];
}

interface ApiBody<T> {
  errors?: unknown;
  response?: T[];
  paging?: { current: number; total: number };
}

// ─── Fetch helper (with call counter + 429 backoff) ───────────────────────────

let apiCalls = 0;
let lastRateLimitRemaining: string | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function apiGet<T>(
  path: string,
  params: Record<string, string | number>,
): Promise<ApiBody<T>> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  for (let attempt = 1; attempt <= 4; attempt++) {
    apiCalls++;
    const res = await fetch(url, { headers: { "x-apisports-key": API_FOOTBALL_KEY } });
    lastRateLimitRemaining =
      res.headers.get("x-ratelimit-requests-remaining") ?? lastRateLimitRemaining;

    if (res.status === 429) {
      const waitMs = 15_000 * attempt;
      console.warn(`API-Football 429 on ${path} — waiting ${waitMs / 1000}s (attempt ${attempt})`);
      await sleep(waitMs);
      continue;
    }
    if (!res.ok) throw new Error(`API-Football ${path} failed: HTTP ${res.status}`);

    const body = (await res.json()) as ApiBody<T>;
    const errors = body.errors;
    if (errors && (Array.isArray(errors) ? errors.length > 0 : Object.keys(errors as object).length > 0)) {
      throw new Error(`API-Football ${path} error: ${JSON.stringify(errors)}`);
    }
    return body;
  }
  throw new Error(`API-Football ${path}: still rate-limited after retries`);
}

// ─── Provider fetchers (self-contained mirrors of provider.ts) ────────────────

interface ProviderFixture {
  id: number;
  round: string;
  kickoff: string;
  status: string;
  homeTeam: { id: number | null; name: string | null };
  awayTeam: { id: number | null; name: string | null };
  homeScore: number | null;
  awayScore: number | null;
}

async function getLeagueFixtures(): Promise<ProviderFixture[]> {
  const body = await apiGet<RawFixture>("/fixtures", {
    league: EPL_LEAGUE_ID,
    season: EPL_SEASON,
  });
  return (body.response ?? []).map((raw) => ({
    id: raw.fixture.id,
    round: raw.league.round,
    kickoff: raw.fixture.date,
    status: raw.fixture.status.short,
    homeTeam: raw.teams.home,
    awayTeam: raw.teams.away,
    homeScore: raw.goals.home,
    awayScore: raw.goals.away,
  }));
}

async function getLeagueTeams(): Promise<Map<number, string>> {
  const body = await apiGet<RawTeam>("/teams", {
    league: EPL_LEAGUE_ID,
    season: EPL_SEASON,
  });
  const teams = new Map<number, string>();
  for (const entry of body.response ?? []) {
    teams.set(entry.team.id, entry.team.name);
  }
  return teams;
}

interface SquadPlayer {
  id: number;
  name: string;
  position: Position;
  photo: string | null;
}

async function getTeamSquad(teamId: number): Promise<{ teamName: string; players: SquadPlayer[] }> {
  const body = await apiGet<RawSquad>("/players/squads", { team: teamId });
  const squad = body.response?.[0];
  if (!squad) return { teamName: "", players: [] };
  return {
    teamName: squad.team.name,
    players: squad.players.map((p) => ({
      id: p.id,
      name: p.name,
      position: mapPositionOrMid(p.position),
      photo: p.photo,
    })),
  };
}

type PlayerRating = { rating: number | null; appearances: number | null; goals: number | null };

/** Season ratings per player (paginated; EPL squads may span several pages). */
async function getTeamPlayerRatings(teamId: number): Promise<Map<number, PlayerRating>> {
  const ratings = new Map<number, PlayerRating>();
  let page = 1;
  while (page <= 6) {
    const body = await apiGet<RawPlayerWithStats>("/players", {
      team: teamId,
      season: EPL_SEASON,
      league: EPL_LEAGUE_ID,
      page,
    });
    for (const entry of body.response ?? []) {
      const stat = entry.statistics.find((s) => s.team.id === teamId) ?? entry.statistics[0];
      ratings.set(entry.player.id, {
        rating: stat?.games.rating ? Number(stat.games.rating) : null,
        appearances: stat?.games.appearences ?? null,
        goals: stat?.goals.total ?? null,
      });
    }
    if (!body.paging || body.paging.current >= body.paging.total) break;
    page++;
  }
  return ratings;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** lock_at = earliest GW kickoff minus 90 minutes (FPL KO−90m). */
function lockAtFor(fixtures: ProviderFixture[]): string {
  const earliestMs = Math.min(...fixtures.map((f) => new Date(f.kickoff).getTime()));
  return new Date(earliestMs - DEADLINE_LEAD_MS).toISOString();
}

/** Provisional lock spaced one week per GW from GW1's earliest kickoff. */
function provisionalLockAt(gw: number, gw1EarliestKickoffMs: number): string {
  const kickoffMs = gw1EarliestKickoffMs + (gw - 1) * ONE_WEEK_MS;
  return new Date(kickoffMs - DEADLINE_LEAD_MS).toISOString();
}

function teamsFromFixtures(fixtures: ProviderFixture[]): Map<number, string> {
  const teams = new Map<number, string>();
  for (const f of fixtures) {
    for (const t of [f.homeTeam, f.awayTeam]) {
      if (t.id != null && t.name) teams.set(t.id, t.name);
    }
  }
  return teams;
}

function fail(message: string, error?: unknown): never {
  console.error(`\nSEED FAILED: ${message}`);
  if (error) console.error(error);
  process.exit(1);
}

/**
 * Hide World Cup / non-league leftovers. `nation` is the club label in the UI —
 * WC rows still say "Argentina" etc. and must not appear in the picker.
 */
async function deactivateNonEplPlayers(eplTeamIds: Iterable<number>): Promise<number> {
  const keep = new Set(eplTeamIds);
  if (keep.size === 0) return 0;

  const { data: rows, error: readErr } = await supabase
    .from("fantasy_players")
    .select("provider_player_id, team_id")
    .eq("is_active", true);
  if (readErr) fail("could not list active players for cleanup", readErr);

  const dropIds = (rows ?? [])
    .filter((r) => !keep.has(Number(r.team_id)))
    .map((r) => Number(r.provider_player_id));

  for (let i = 0; i < dropIds.length; i += 200) {
    const chunk = dropIds.slice(i, i + 200);
    const { error } = await supabase
      .from("fantasy_players")
      .update({ is_active: false })
      .in("provider_player_id", chunk);
    if (error) fail("could not deactivate non-EPL players", error);
  }
  return dropIds.length;
}

// ─── Local timelapse (compressed schedule for mechanic testing) ───────────────

/**
 * Pack N gameweeks into TIMELAPSE_HOURS. GW1 locks in ~15 minutes so you can
 * build a squad first. Each GW slot = window/N; 4 fixtures per GW with kickoffs
 * after lock+90m. Requires FANTASY_LOCAL_TIMELAPSE=true on the Next app/worker
 * so provider refresh does not overwrite these kickoffs.
 */
async function seedTimelapse() {
  const windowMs = TIMELAPSE_HOURS * 3600_000;
  const slotMs = Math.floor(windowMs / TIMELAPSE_GWS);
  const now = Date.now();
  const gw1LockMs = now + 15 * 60_000;

  console.log(
    `LOCAL TIMELAPSE seed — ${TIMELAPSE_GWS} GWs in ${TIMELAPSE_HOURS}h ` +
      `(ids ${EPL_MATCHDAY_OFFSET + 1}–${EPL_MATCHDAY_OFFSET + TIMELAPSE_GWS})\n`,
  );
  console.log(`GW1 lock_at ≈ ${new Date(gw1LockMs).toISOString()} (in ~15 minutes)\n`);

  // Ensure season settings point at EPL bounds (migration may already have done this).
  const { data: settingsRow, error: settingsErr } = await supabase
    .from("fantasy_settings")
    .select("config")
    .eq("id", 1)
    .maybeSingle();
  if (settingsErr) fail("could not read fantasy_settings", settingsErr);
  if (settingsRow?.config) {
    const config = {
      ...(settingsRow.config as object),
      season_matchday_min: EPL_MATCHDAY_OFFSET + 1,
      season_matchday_max: EPL_MATCHDAY_OFFSET + TOTAL_GAMEWEEKS,
    };
    const { error } = await supabase
      .from("fantasy_settings")
      .update({ config, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) fail("could not update fantasy_settings for timelapse", error);
  }

  let teams = await getLeagueTeams();
  if (teams.size === 0) fail("no EPL teams from /teams — check API_FOOTBALL_KEY");
  const teamList = [...teams.entries()];

  // Players (needed for squad builder).
  let playerCount = 0;
  if (SKIP_PLAYERS) {
    console.log("SEED_SKIP_PLAYERS=true — player seeding skipped.");
  } else {
    console.log(`Seeding players for ${teams.size} teams…`);
    for (const [teamId, teamNameFromLeague] of teams) {
      const squad = await getTeamSquad(teamId);
      const ratings = await getTeamPlayerRatings(teamId);
      const teamName = squad.teamName || teamNameFromLeague;
      if (squad.players.length === 0) {
        console.warn(`  ${teamName} (${teamId}): no squad — skipped.`);
        continue;
      }
      const rows = squad.players.map((p) => {
        const r = ratings.get(p.id) ?? { rating: null, appearances: null, goals: null };
        return {
          provider_player_id: p.id,
          team_id: teamId,
          name: p.name,
          nation: teamName,
          position: p.position,
          price: heuristicPrice(p.position, r.rating, r.goals, r.appearances),
          photo_url: p.photo,
          is_active: true,
          meta: { rating: r.rating, appearances: r.appearances, goals: r.goals },
        };
      });
      const { error } = await supabase
        .from("fantasy_players")
        .upsert(rows, { onConflict: "provider_player_id" });
      if (error) fail(`upsert players ${teamName}`, error);
      playerCount += rows.length;
      console.log(`  ${teamName}: ${rows.length} players.`);
      await sleep(SEED_DELAY_MS);
    }
  }

  const deactivated = await deactivateNonEplPlayers(teams.keys());
  if (deactivated > 0) {
    console.log(`Deactivated ${deactivated} non-EPL (WC leftover) players.`);
  }

  // Force WC rounds final so they never become current.
  await supabase
    .from("fantasy_matchdays")
    .update({ status: "final", updated_at: new Date().toISOString() })
    .in("id", [6, 7, 8]);

  const schedule: { gw: number; lockAt: string; fixtures: string[] }[] = [];

  for (let gw = 1; gw <= TIMELAPSE_GWS; gw++) {
    const mdId = EPL_MATCHDAY_OFFSET + gw;
    const meta = matchdayMeta(gw);
    const lockMs = gw1LockMs + (gw - 1) * slotMs;
    const lockAt = new Date(lockMs).toISOString();

    const { error: mdErr } = await supabase.from("fantasy_matchdays").upsert(
      {
        id: mdId,
        label: meta.label,
        round: meta.round,
        display_name: meta.displayName,
        lock_at: lockAt,
        status: "upcoming",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (mdErr) fail(`upsert matchday ${mdId}`, mdErr);

    // Drop prior timelapse fixtures for this GW (synthetic id range only).
    await supabase
      .from("fantasy_fixtures")
      .delete()
      .eq("matchday_id", mdId)
      .gte("provider_fixture_id", TIMELAPSE_FIXTURE_BASE)
      .lt("provider_fixture_id", TIMELAPSE_FIXTURE_BASE + 100_000);

    const fixtureRows = [];
    const kickoffLabels: string[] = [];
    for (let i = 0; i < 4; i++) {
      const home = teamList[(gw - 1 + i * 2) % teamList.length];
      const away = teamList[(gw - 1 + i * 2 + 1) % teamList.length];
      // Kickoffs: lock+90m, then +2h steps so a GW plays out inside its slot.
      const kickoffMs = lockMs + DEADLINE_LEAD_MS + i * 2 * 3600_000;
      const kickoff = new Date(kickoffMs).toISOString();
      kickoffLabels.push(kickoff);
      fixtureRows.push({
        provider_fixture_id: TIMELAPSE_FIXTURE_BASE + mdId * 10 + i,
        matchday_id: mdId,
        home_team_id: home[0],
        away_team_id: away[0],
        home_team: home[1],
        away_team: away[1],
        kickoff,
        status: "NS",
        home_score: null,
        away_score: null,
        finished_at: null,
        last_stats_sync: null,
        stats_finalized: false,
      });
    }

    const { error: fxErr } = await supabase
      .from("fantasy_fixtures")
      .upsert(fixtureRows, { onConflict: "provider_fixture_id" });
    if (fxErr) fail(`upsert fixtures GW${gw}`, fxErr);

    schedule.push({ gw, lockAt, fixtures: kickoffLabels });
    console.log(
      `GW${gw} (id ${mdId}): lock ${lockAt} · ${fixtureRows.length} fixtures ` +
        `(first KO ${kickoffLabels[0]})`,
    );
  }

  // Leave remaining EPL matchdays alone if present; optionally mark 105+ far future.
  console.log("\n─── Timelapse summary ────────────────────────");
  console.log(`Players upserted: ${playerCount}`);
  console.log(`Set FANTASY_LOCAL_TIMELAPSE=true in .env and restart next dev.`);
  console.log(`Tick the worker to advance: POST /api/play/worker with x-internal-auth.`);
  console.log("Schedule:");
  for (const row of schedule) {
    console.log(`  GW${row.gw} lock=${row.lockAt}`);
  }
  console.log("Done.");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (TIMELAPSE_HOURS > 0) {
    await seedTimelapse();
    return;
  }

  console.log(
    `Seeding Noblocks Play fantasy data (EPL ${EPL_SEASON}, GW1–GW${TOTAL_GAMEWEEKS})…\n`,
  );

  // 1. All EPL fixtures (one call).
  const fixtures = await getLeagueFixtures();
  if (fixtures.length === 0) fail("provider returned no EPL fixtures");
  console.log(`Fetched ${fixtures.length} EPL fixtures.`);

  // Group fixtures by matchday id (101–138); skip unknown rounds.
  const byMatchday = new Map<number, ProviderFixture[]>();
  let skippedRounds = 0;
  for (const f of fixtures) {
    const mdId = roundToMatchdayId(f.round);
    if (mdId == null) {
      skippedRounds++;
      continue;
    }
    const list = byMatchday.get(mdId) ?? [];
    list.push(f);
    byMatchday.set(mdId, list);
  }
  if (skippedRounds > 0) {
    console.warn(`Skipped ${skippedRounds} fixtures with unknown/non-league rounds.`);
  }

  // GW1 earliest kickoff — anchor for provisional locks on fixture-less GWs.
  const gw1Fixtures = byMatchday.get(EPL_MATCHDAY_OFFSET + 1) ?? [];
  const gw1EarliestKickoffMs =
    gw1Fixtures.length > 0
      ? Math.min(...gw1Fixtures.map((f) => new Date(f.kickoff).getTime()))
      : null;

  // 2. Upsert matchdays 101–138. Never overwrite status/lock_at once a row has
  //    left 'upcoming' (the worker owns transitions from then on).
  const { data: existingMds, error: mdReadError } = await supabase
    .from("fantasy_matchdays")
    .select("id, status");
  if (mdReadError) fail("could not read fantasy_matchdays", mdReadError);

  const seededMatchdayIds: number[] = [];
  for (const mdId of ALL_MATCHDAY_IDS) {
    const gw = mdId - EPL_MATCHDAY_OFFSET;
    const meta = matchdayMeta(gw);
    const mdFixtures = byMatchday.get(mdId) ?? [];
    const hasFixtures = mdFixtures.length > 0;

    let lockAt: string | null;
    let provisional = false;

    if (hasFixtures) {
      lockAt = lockAtFor(mdFixtures);
    } else if (gw1EarliestKickoffMs != null) {
      lockAt = provisionalLockAt(gw, gw1EarliestKickoffMs);
      provisional = true;
      console.warn(
        `Matchday ${mdId} (${meta.displayName}): no fixtures yet — ` +
          `seeding with PROVISIONAL lock_at ${lockAt} (worker re-syncs once fixtures appear).`,
      );
    } else {
      console.warn(
        `Matchday ${mdId} (${meta.displayName}): no fixtures and no GW1 anchor — skipped.`,
      );
      continue;
    }

    const existing = existingMds?.find((row) => row.id === mdId);

    if (!existing) {
      const { error } = await supabase.from("fantasy_matchdays").insert({
        id: mdId,
        label: meta.label,
        round: meta.round,
        display_name: meta.displayName,
        lock_at: lockAt,
        status: "upcoming",
      });
      if (error) fail(`insert fantasy_matchdays ${mdId}`, error);
      console.log(
        `Matchday ${mdId} (${meta.label}) created — lock_at ${lockAt}${provisional ? " (provisional)" : ""}.`,
      );
    } else if (existing.status === "upcoming") {
      // Refresh lock_at from fixtures when available; never regress to provisional.
      const update: Record<string, unknown> = {
        label: meta.label,
        round: meta.round,
        display_name: meta.displayName,
        ...(hasFixtures ? { lock_at: lockAt } : {}),
      };
      const { error } = await supabase.from("fantasy_matchdays").update(update).eq("id", mdId);
      if (error) fail(`update fantasy_matchdays ${mdId}`, error);
      console.log(
        `Matchday ${mdId} (${meta.label}) refreshed` +
          (hasFixtures ? ` — lock_at ${lockAt}` : " (lock_at left as-is, no fixtures yet)"),
      );
    } else {
      console.log(
        `Matchday ${mdId} is '${existing.status}' — status/lock_at left untouched.`,
      );
    }
    seededMatchdayIds.push(mdId);
  }

  // 3. Upsert fixtures for every GW that has provider data.
  let fixtureCount = 0;
  for (const [mdId, mdFixtures] of byMatchday) {
    const rows = mdFixtures.map((f) => ({
      provider_fixture_id: f.id,
      matchday_id: mdId,
      home_team_id: f.homeTeam.id ?? 0,
      away_team_id: f.awayTeam.id ?? 0,
      home_team: f.homeTeam.name ?? "Unknown",
      away_team: f.awayTeam.name ?? "Unknown",
      kickoff: f.kickoff,
      status: f.status,
      home_score: f.homeScore,
      away_score: f.awayScore,
    }));
    const { error } = await supabase
      .from("fantasy_fixtures")
      .upsert(rows, { onConflict: "provider_fixture_id" });
    if (error) fail(`upsert fantasy_fixtures for matchday ${mdId}`, error);
    fixtureCount += rows.length;
  }
  console.log(`Upserted ${fixtureCount} fixtures across ${byMatchday.size} gameweeks.`);

  // 4. Teams: all 20 EPL clubs via /teams, falling back to fixture-derived ids.
  let teams = await getLeagueTeams();
  if (teams.size === 0) {
    console.warn("/teams returned no rows — falling back to teams from fixtures.");
    teams = teamsFromFixtures(fixtures);
  }
  if (teams.size === 0) fail("no EPL teams found");

  let playerCount = 0;
  const eplTeamIds = [...teams.keys()];
  if (SKIP_PLAYERS) {
    console.log("SEED_SKIP_PLAYERS=true — player seeding skipped.");
  } else {
    console.log(`Seeding players for ${teams.size} teams…`);
    for (const [teamId, teamNameFromLeague] of teams) {
      // Sequential on purpose: keeps request pacing predictable for the 429 backoff.
      const squad = await getTeamSquad(teamId);
      const ratings = await getTeamPlayerRatings(teamId);
      const teamName = squad.teamName || teamNameFromLeague;
      if (squad.players.length === 0) {
        console.warn(`  ${teamName} (${teamId}): provider returned no squad — skipped.`);
        continue;
      }

      const rows = squad.players.map((p) => {
        const r = ratings.get(p.id) ?? { rating: null, appearances: null, goals: null };
        return {
          provider_player_id: p.id,
          team_id: teamId,
          name: p.name,
          nation: teamName, // club name shown under player in the picker
          position: p.position,
          price: heuristicPrice(p.position, r.rating, r.goals, r.appearances),
          photo_url: p.photo,
          is_active: true,
          meta: { rating: r.rating, appearances: r.appearances, goals: r.goals },
        };
      });

      const { error } = await supabase
        .from("fantasy_players")
        .upsert(rows, { onConflict: "provider_player_id" });
      if (error) fail(`upsert fantasy_players for team ${teamName} (${teamId})`, error);

      playerCount += rows.length;
      console.log(`  ${teamName}: ${rows.length} players seeded.`);
      await sleep(SEED_DELAY_MS);
    }
  }

  const deactivated = await deactivateNonEplPlayers(eplTeamIds);
  if (deactivated > 0) {
    console.log(`Deactivated ${deactivated} non-EPL (WC leftover) players.`);
  }

  // 5. Summary.
  console.log("\n─── Seed summary ─────────────────────────────");
  console.log(`Matchdays seeded:   ${seededMatchdayIds.length} (${seededMatchdayIds[0]}–${seededMatchdayIds[seededMatchdayIds.length - 1] ?? "n/a"})`);
  console.log(`Fixtures upserted:  ${fixtureCount}`);
  console.log(`Teams processed:    ${eplTeamIds.length}`);
  console.log(`Players upserted:   ${playerCount}`);
  console.log(`API calls used:     ${apiCalls}`);
  if (lastRateLimitRemaining != null) {
    console.log(`API quota left:     ${lastRateLimitRemaining} (x-ratelimit-requests-remaining)`);
  }
  console.log("Done.");
}

main().catch((e) => fail("unhandled error", e));
