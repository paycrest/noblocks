/**
 * Noblocks Play — fantasy league seed script (handoff §5.4).
 *
 * Seeds `fantasy_matchdays` (6/7/8), `fantasy_fixtures` and `fantasy_players`
 * from API-Football (World Cup 2026: league=1, season=2026).
 *
 * Usage (from scripts/):
 *   SUPABASE_URL=… SUPABASE_SECRET_KEY=… API_FOOTBALL_KEY=… pnpm seed:fantasy
 *
 * Idempotent: matchdays/fixtures/players are upserted; a matchday's
 * status/lock_at are never overwritten once the row has left 'upcoming'.
 *
 * NOTE: this script deliberately does NOT import app/lib/fantasy/provider.ts —
 * that module imports "server-only", which throws outside the Next.js runtime.
 * The fetch helpers below mirror its response-shape handling (RawFixture,
 * RawSquad, RawPlayerWithStats, POSITION_MAP, ratings pagination).
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
const WORLD_CUP_LEAGUE_ID = 1;
const WORLD_CUP_SEASON = 2026;

const ROUND_TO_MATCHDAY: Record<string, number> = {
  "Round of 16": 5,
  "Quarter-finals": 6,
  "Semi-finals": 7,
  "3rd Place Final": 8,
  Final: 8,
};

const MATCHDAY_META: Record<number, { label: string; round: string; displayName: string }> = {
  5: { label: "MD5", round: "Round of 16", displayName: "Round of 16" },
  6: { label: "MD6", round: "Quarter-finals", displayName: "Quarter-finals" },
  7: { label: "MD7", round: "Semi-finals", displayName: "Semi-finals" },
  8: { label: "MD8", round: "Final", displayName: "Final" },
};

// SEED_INCLUDE_R16=true — INTERNAL TESTING ONLY: also seed the Round of 16
// as scored matchday 5 so the full pipeline can be exercised before the QFs.
// The public campaign scores MD6–8 (PRD O-1); remove MD5 before launch (see
// docs/fantasy-league.md teardown).
const INCLUDE_R16 = (process.env.SEED_INCLUDE_R16 ?? "").toLowerCase() === "true";
// SEED_SKIP_PLAYERS=true — skip squad/ratings fetching on re-runs (saves
// ~50 provider calls when only matchdays/fixtures need refreshing).
const SKIP_PLAYERS = (process.env.SEED_SKIP_PLAYERS ?? "").toLowerCase() === "true";
const MATCHDAY_IDS = INCLUDE_R16 ? [5, 6, 7, 8] : [6, 7, 8];

// Knockout fixtures only appear on the provider once the bracket resolves
// (mid-R16 the QF/SF/Final rounds are empty). Until then, matchdays are
// seeded with PROVISIONAL locks from the official FIFA schedule — the worker
// re-syncs lock_at to the real earliest kickoff as soon as fixtures publish.
const PROVISIONAL_LOCK_AT: Record<number, string> = {
  6: "2026-07-09T15:00:00Z", // first Quarter-final day
  7: "2026-07-14T15:00:00Z", // first Semi-final day
  8: "2026-07-18T15:00:00Z", // bronze final day (MD8 = bronze + final)
};

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

// Heuristic price seed (handoff §2.3 / §5.4).
const BASE_PRICE: Record<Position, number> = { GK: 4.5, DEF: 5.0, MID: 5.5, FWD: 6.0 };
const PRICE_MIN = 4.0;
const PRICE_MAX = 11.0;

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

async function getWorldCupFixtures(): Promise<ProviderFixture[]> {
  const body = await apiGet<RawFixture>("/fixtures", {
    league: WORLD_CUP_LEAGUE_ID,
    season: WORLD_CUP_SEASON,
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
    players: squad.players
      .map((p) => {
        const position = mapPosition(p.position);
        if (!position) return null;
        return { id: p.id, name: p.name, position, photo: p.photo };
      })
      .filter((p): p is SquadPlayer => p !== null),
  };
}

type PlayerRating = { rating: number | null; appearances: number | null; goals: number | null };

/** Tournament ratings per player (paginated; WC squads ≈ 2 pages of 20). */
async function getTeamPlayerRatings(teamId: number): Promise<Map<number, PlayerRating>> {
  const ratings = new Map<number, PlayerRating>();
  let page = 1;
  while (page <= 4) {
    const body = await apiGet<RawPlayerWithStats>("/players", {
      team: teamId,
      season: WORLD_CUP_SEASON,
      league: WORLD_CUP_LEAGUE_ID,
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

/** Placeholder / not-yet-determined knockout slots (bracket not drawn yet). */
function isPlaceholderTeam(team: { id: number | null; name: string | null }): boolean {
  if (team.id == null) return true;
  if (!team.name) return true;
  return /\b(tbd|to be|winner|loser)\b/i.test(team.name);
}

function earliestKickoff(fixtures: ProviderFixture[]): string {
  return fixtures
    .map((f) => f.kickoff)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
}

/**
 * Lock time for a matchday. Normally the round's earliest kickoff; when the
 * round is already underway (mid-R16 internal testing) the lock is the next
 * NOT-yet-started kickoff so there's still a build window before it flips
 * live. The worker never moves an upcoming round's lock into the past.
 */
function lockAtFor(fixtures: ProviderFixture[]): string {
  const notStarted = fixtures.filter((f) => f.status === "NS" || f.status === "TBD");
  return earliestKickoff(notStarted.length > 0 ? notStarted : fixtures);
}

function fail(message: string, error?: unknown): never {
  console.error(`\nSEED FAILED: ${message}`);
  if (error) console.error(error);
  process.exit(1);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding Noblocks Play fantasy data (WC 2026, matchdays 6–8)…\n");

  // 1. All World Cup fixtures (one call).
  const fixtures = await getWorldCupFixtures();
  if (fixtures.length === 0) fail("provider returned no World Cup fixtures");
  console.log(`Fetched ${fixtures.length} World Cup fixtures.`);

  // Group scored-round fixtures by matchday.
  const byMatchday = new Map<number, ProviderFixture[]>();
  for (const f of fixtures) {
    const md = ROUND_TO_MATCHDAY[f.round];
    if (!md) continue;
    const list = byMatchday.get(md) ?? [];
    list.push(f);
    byMatchday.set(md, list);
  }

  // 2. Upsert matchdays 6/7/8. Never overwrite status/lock_at once a row has
  //    left 'upcoming' (the worker owns transitions from then on).
  const { data: existingMds, error: mdReadError } = await supabase
    .from("fantasy_matchdays")
    .select("id, status");
  if (mdReadError) fail("could not read fantasy_matchdays", mdReadError);

  const seededMatchdayIds: number[] = [];
  for (const mdId of MATCHDAY_IDS) {
    const mdFixtures = byMatchday.get(mdId) ?? [];
    const meta = MATCHDAY_META[mdId];
    const provisional = mdFixtures.length === 0;
    if (provisional && !PROVISIONAL_LOCK_AT[mdId]) {
      console.warn(
        `Matchday ${mdId} (${meta.displayName}): no fixtures and no provisional lock — skipped.`,
      );
      continue;
    }
    const lockAt = provisional ? PROVISIONAL_LOCK_AT[mdId] : lockAtFor(mdFixtures);
    if (provisional) {
      console.warn(
        `Matchday ${mdId} (${meta.displayName}): fixtures not published yet — ` +
          `seeding with PROVISIONAL lock_at ${lockAt} (worker re-syncs it once fixtures appear).`,
      );
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
      console.log(`Matchday ${mdId} (${meta.label}) created — lock_at ${lockAt}.`);
    } else if (existing.status === "upcoming") {
      // Never regress a real (fixture-derived) lock back to a provisional one.
      const update: Record<string, unknown> = {
        label: meta.label,
        round: meta.round,
        display_name: meta.displayName,
        ...(provisional ? {} : { lock_at: lockAt }),
      };
      const { error } = await supabase.from("fantasy_matchdays").update(update).eq("id", mdId);
      if (error) fail(`update fantasy_matchdays ${mdId}`, error);
      console.log(
        `Matchday ${mdId} (${meta.label}) refreshed${provisional ? " (lock_at left as-is)" : ` — lock_at ${lockAt}`}.`,
      );
    } else {
      console.log(
        `Matchday ${mdId} is '${existing.status}' — status/lock_at left untouched.`,
      );
    }
    seededMatchdayIds.push(mdId);
  }

  // 2b. Internal R16 testing: the validation/settings maps are keyed by
  //     matchday label, so MD5 needs nation-cap and free-transfer entries.
  if (INCLUDE_R16) {
    const { data: settingsRow, error: settingsError } = await supabase
      .from("fantasy_settings")
      .select("config")
      .eq("id", 1)
      .single();
    if (settingsError || !settingsRow) fail("could not read fantasy_settings", settingsError);
    const config = settingsRow.config as {
      nation_caps?: Record<string, number>;
      free_transfers?: Record<string, number>;
    };
    let settingsChanged = false;
    if (config.nation_caps?.MD5 == null) {
      config.nation_caps = { ...config.nation_caps, MD5: 4 };
      settingsChanged = true;
    }
    if (config.free_transfers?.MD5 == null) {
      config.free_transfers = { ...config.free_transfers, MD5: 4 };
      settingsChanged = true;
    }
    if (settingsChanged) {
      const { error } = await supabase
        .from("fantasy_settings")
        .update({ config })
        .eq("id", 1);
      if (error) fail("could not add MD5 keys to fantasy_settings", error);
      console.log("Added MD5 nation-cap/free-transfer settings (R16 test mode).");
    }
  }

  // 3. Upsert fixtures for the seeded matchdays. Placeholder teams get id 0 /
  //    name "TBD"; a later re-run overwrites them once the bracket is known.
  let fixtureCount = 0;
  for (const mdId of seededMatchdayIds) {
    const rows = (byMatchday.get(mdId) ?? []).map((f) => ({
      provider_fixture_id: f.id,
      matchday_id: mdId,
      home_team_id: f.homeTeam.id ?? 0,
      away_team_id: f.awayTeam.id ?? 0,
      home_team: f.homeTeam.name ?? "TBD",
      away_team: f.awayTeam.name ?? "TBD",
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
  console.log(`Upserted ${fixtureCount} fixtures across matchdays ${seededMatchdayIds.join("/")}.`);

  // 4. Teams: distinct ids from Round-of-16 fixtures (the 16 possible QF+
  //    participants). If the R16 bracket is still TBD, fall back to every
  //    concrete team appearing in any fixture.
  const r16Fixtures = fixtures.filter((f) => f.round === "Round of 16");
  const teams = new Map<number, string>();
  for (const f of r16Fixtures) {
    for (const t of [f.homeTeam, f.awayTeam]) {
      if (!isPlaceholderTeam(t)) teams.set(t.id as number, t.name as string);
    }
  }
  if (teams.size === 0) {
    console.warn(
      "Round-of-16 teams unknown/TBD — falling back to ALL teams in any fixture (heavier on the API budget).",
    );
    for (const f of fixtures) {
      for (const t of [f.homeTeam, f.awayTeam]) {
        if (!isPlaceholderTeam(t)) teams.set(t.id as number, t.name as string);
      }
    }
  }
  if (teams.size === 0) fail("no concrete teams found in any fixture");

  let playerCount = 0;
  if (SKIP_PLAYERS) {
    console.log("SEED_SKIP_PLAYERS=true — player seeding skipped.");
    teams.clear();
  } else {
    console.log(`Seeding players for ${teams.size} teams…`);
  }
  for (const [teamId, teamNameFromFixture] of teams) {
    // Sequential on purpose: keeps request pacing predictable for the 429 backoff.
    const squad = await getTeamSquad(teamId);
    const ratings = await getTeamPlayerRatings(teamId);
    const teamName = squad.teamName || teamNameFromFixture;
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
    if (error) fail(`upsert fantasy_players for team ${teamName} (${teamId})`, error);

    playerCount += rows.length;
    console.log(`  ${teamName}: ${rows.length} players seeded.`);
    await sleep(Number(process.env.SEED_DELAY_MS ?? 300)); // be gentle to the API
  }

  // 5. Summary.
  console.log("\n─── Seed summary ─────────────────────────────");
  console.log(`Matchdays seeded:   ${seededMatchdayIds.join(", ") || "none"}`);
  console.log(`Fixtures upserted:  ${fixtureCount}`);
  console.log(`Teams processed:    ${teams.size}`);
  console.log(`Players upserted:   ${playerCount}`);
  console.log(`API calls used:     ${apiCalls}`);
  if (lastRateLimitRemaining != null) {
    console.log(`API quota left:     ${lastRateLimitRemaining} (x-ratelimit-requests-remaining)`);
  }
  console.log("Done.");
}

main().catch((e) => fail("unhandled error", e));
