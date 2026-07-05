import "server-only";
import type { PlayerMatchStats, Position } from "./types";
import { emptyStats } from "./scoring";

/**
 * API-Football (api-sports.io) provider module — the single place that talks
 * to the data vendor (TRD §2.5). Everything else consumes the domain types
 * exported here, so a future provider migration is contained to this file.
 *
 * User traffic must NEVER reach this module: only the scoring worker and the
 * seed script call it (TRD §2.4).
 */

const BASE_URL = "https://v3.football.api-sports.io";
export const WORLD_CUP_LEAGUE_ID = 1;
export const WORLD_CUP_SEASON = 2026;

/**
 * Provider round names → our matchday ids. MD5 (Round of 16) is only scored
 * when its matchday row was seeded (SEED_INCLUDE_R16 — internal testing);
 * otherwise the worker ignores its fixtures entirely.
 */
export const ROUND_TO_MATCHDAY: Record<string, number> = {
  "Round of 16": 5,
  "Quarter-finals": 6,
  "Semi-finals": 7,
  "3rd Place Final": 8,
  Final: 8,
};

/** Fixture short statuses that mean "in progress" (rolling lockout = locked). */
export const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT"]);
/** Fixture short statuses that mean "completed". */
export const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"]);

let lastRateLimit: { remaining: number | null; limit: number | null } = {
  remaining: null,
  limit: null,
};

/** Last x-ratelimit reading, surfaced for worker monitoring (TRD §8). */
export function getProviderRateLimit() {
  return lastRateLimit;
}

function apiKey(): string {
  const key = process.env.API_FOOTBALL_KEY || process.env.api_football_key;
  if (!key) throw new Error("Missing env API_FOOTBALL_KEY");
  return key;
}

const FETCH_TIMEOUT_MS = 10_000;

/** Parses a numeric header, preserving a real `0` instead of coercing it to `null`. */
function parseRateLimitHeader(value: string | null): number | null {
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

async function apiGet<T>(path: string, params: Record<string, string | number>): Promise<T[]> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "x-apisports-key": apiKey() },
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  lastRateLimit = {
    remaining: parseRateLimitHeader(res.headers.get("x-ratelimit-requests-remaining")),
    limit: parseRateLimitHeader(res.headers.get("x-ratelimit-requests-limit")),
  };

  if (!res.ok) {
    throw new Error(`API-Football ${path} failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as { errors?: unknown; response?: T[] };
  const errors = body.errors;
  if (errors && (Array.isArray(errors) ? errors.length > 0 : Object.keys(errors).length > 0)) {
    throw new Error(`API-Football ${path} error: ${JSON.stringify(errors)}`);
  }
  return body.response ?? [];
}

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface ProviderFixture {
  id: number;
  round: string;
  kickoff: string; // ISO
  status: string; // short code
  homeTeam: { id: number; name: string };
  awayTeam: { id: number; name: string };
  homeScore: number | null;
  awayScore: number | null;
}

export interface ProviderSquadPlayer {
  id: number;
  name: string;
  position: Position;
  photo: string | null;
  rating: number | null; // season average when available
  appearances: number | null;
  teamGoals: number | null;
}

export interface ProviderEvent {
  minute: number;
  extraMinute: number | null;
  teamId: number;
  playerId: number | null;
  assistPlayerId: number | null;
  type: string; // Goal | Card | subst | Var
  detail: string; // Normal Goal | Own Goal | Penalty | Yellow Card | ...
  comments: string | null;
}

// ─── Raw provider shapes (only the fields we read) ───────────────────────────

interface RawFixture {
  fixture: {
    id: number;
    date: string;
    status: { short: string };
  };
  league: { round: string };
  teams: { home: { id: number; name: string }; away: { id: number; name: string } };
  goals: { home: number | null; away: number | null };
}

interface RawFixturePlayers {
  team: { id: number; name: string };
  players: {
    player: { id: number; name: string; photo?: string };
    statistics: {
      games: { minutes: number | null; position: string | null; substitute: boolean };
      shots: { total: number | null; on: number | null };
      goals: {
        total: number | null;
        conceded: number | null;
        assists: number | null;
        saves: number | null;
      };
      passes: { key: number | null };
      tackles: { total: number | null };
      cards: { yellow: number | null; red: number | null };
      penalty: {
        won: number | null;
        commited: number | null; // provider's spelling
        saved: number | null;
      };
    }[];
  }[];
}

interface RawEvent {
  time: { elapsed: number; extra: number | null };
  team: { id: number };
  player: { id: number | null };
  assist: { id: number | null };
  type: string;
  detail: string;
  comments: string | null;
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

// ─── Fetchers ─────────────────────────────────────────────────────────────────

const mapFixture = (raw: RawFixture): ProviderFixture => ({
  id: raw.fixture.id,
  round: raw.league.round,
  kickoff: raw.fixture.date,
  status: raw.fixture.status.short,
  homeTeam: raw.teams.home,
  awayTeam: raw.teams.away,
  homeScore: raw.goals.home,
  awayScore: raw.goals.away,
});

/** All World Cup fixtures for the season (one call). */
export async function getWorldCupFixtures(): Promise<ProviderFixture[]> {
  const raw = await apiGet<RawFixture>("/fixtures", {
    league: WORLD_CUP_LEAGUE_ID,
    season: WORLD_CUP_SEASON,
  });
  return raw.map(mapFixture);
}

/** Currently-live World Cup fixtures (one call, TRD §2.4). */
export async function getLiveWorldCupFixtures(): Promise<ProviderFixture[]> {
  const raw = await apiGet<RawFixture>("/fixtures", {
    live: "all",
    league: WORLD_CUP_LEAGUE_ID,
  });
  return raw.map(mapFixture);
}

export async function getFixtureEvents(fixtureId: number): Promise<ProviderEvent[]> {
  const raw = await apiGet<RawEvent>("/fixtures/events", { fixture: fixtureId });
  return raw.map((e) => ({
    minute: e.time.elapsed,
    extraMinute: e.time.extra,
    teamId: e.team.id,
    playerId: e.player?.id ?? null,
    assistPlayerId: e.assist?.id ?? null,
    type: e.type,
    detail: e.detail,
    comments: e.comments,
  }));
}

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

export function mapPosition(raw: string | null): Position | null {
  if (!raw) return null;
  return POSITION_MAP[raw] ?? null;
}

/** Team roster (1 call per team). */
export async function getTeamSquad(
  teamId: number,
): Promise<{ teamName: string; players: ProviderSquadPlayer[] }> {
  const raw = await apiGet<RawSquad>("/players/squads", { team: teamId });
  const squad = raw[0];
  if (!squad) return { teamName: "", players: [] };
  return {
    teamName: squad.team.name,
    players: squad.players
      .map((p): ProviderSquadPlayer | null => {
        const position = mapPosition(p.position);
        if (!position) return null;
        return {
          id: p.id,
          name: p.name,
          position,
          photo: p.photo,
          rating: null,
          appearances: null,
          teamGoals: null,
        };
      })
      .filter((p): p is ProviderSquadPlayer => p !== null),
  };
}

/** Tournament ratings per player for the heuristic price seed (paginated). */
export async function getTeamPlayerRatings(
  teamId: number,
): Promise<Map<number, { rating: number | null; appearances: number | null; goals: number | null }>> {
  const ratings = new Map<
    number,
    { rating: number | null; appearances: number | null; goals: number | null }
  >();
  let page = 1;
  // Defensive page cap; WC squads are 26 players (~2 pages of 20).
  while (page <= 4) {
    const url = new URL(`${BASE_URL}/players`);
    url.searchParams.set("team", String(teamId));
    url.searchParams.set("season", String(WORLD_CUP_SEASON));
    url.searchParams.set("league", String(WORLD_CUP_LEAGUE_ID));
    url.searchParams.set("page", String(page));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "x-apisports-key": apiKey() },
        cache: "no-store",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) break;
    const body = (await res.json()) as {
      response: RawPlayerWithStats[];
      paging: { current: number; total: number };
    };
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

// ─── Stats normalization ──────────────────────────────────────────────────────

export interface NormalizedFixtureStats {
  /** playerId → normalized stats ready for the scoring engine. */
  byPlayer: Map<number, { stats: PlayerMatchStats; position: Position | null; teamId: number }>;
}

const isShootoutEvent = (e: ProviderEvent) =>
  Boolean(e.comments && /penalty shootout/i.test(e.comments));

/**
 * Merge /fixtures/players statistics with /fixtures/events into the normalized
 * stat set the scoring matrix needs (TRD §6.8):
 *   * own goals come from events (not in player stats);
 *   * clean sheet / goals conceded are derived from opponent goal events that
 *     fall inside the player's on-pitch window (sub events bound the window);
 *   * direct free-kick goals are best-effort from event comments;
 *   * penalty-shootout events are excluded throughout.
 */
export async function getNormalizedFixtureStats(
  fixtureId: number,
): Promise<NormalizedFixtureStats> {
  const [playersRaw, events] = await Promise.all([
    apiGet<RawFixturePlayers>("/fixtures/players", { fixture: fixtureId }),
    getFixtureEvents(fixtureId),
  ]);

  const scoringEvents = events.filter((e) => !isShootoutEvent(e));

  // On-pitch windows from substitution events. detail "Substitution N":
  // event.player = outgoing, event.assist = incoming.
  const subOutMinute = new Map<number, number>();
  const subInMinute = new Map<number, number>();
  for (const e of scoringEvents) {
    if (e.type.toLowerCase() !== "subst") continue;
    const minute = e.minute + (e.extraMinute ?? 0);
    if (e.playerId != null) subOutMinute.set(e.playerId, minute);
    if (e.assistPlayerId != null) subInMinute.set(e.assistPlayerId, minute);
  }

  // Goal timeline per team (excluding shootout), used for conceded-while-on-pitch.
  const goalEvents = scoringEvents.filter((e) => e.type === "Goal" && e.detail !== "Missed Penalty");
  const ownGoalsByPlayer = new Map<number, number>();
  const freeKickGoalsByPlayer = new Map<number, number>();
  for (const e of goalEvents) {
    if (e.playerId == null) continue;
    if (e.detail === "Own Goal") {
      ownGoalsByPlayer.set(e.playerId, (ownGoalsByPlayer.get(e.playerId) ?? 0) + 1);
    } else if (e.comments && /free.?kick/i.test(e.comments)) {
      freeKickGoalsByPlayer.set(e.playerId, (freeKickGoalsByPlayer.get(e.playerId) ?? 0) + 1);
    }
  }

  const teamIds = playersRaw.map((t) => t.team.id);
  const byPlayer: NormalizedFixtureStats["byPlayer"] = new Map();

  // Match length in minutes (approx): max event minute or 90/120.
  const lastMinute = Math.max(
    90,
    ...scoringEvents.map((e) => e.minute + (e.extraMinute ?? 0)),
  );

  for (const teamEntry of playersRaw) {
    const opponentId = teamIds.find((id) => id !== teamEntry.team.id);

    // Opponent goals against this team, with minutes. An own goal by this
    // team's player also counts against this team.
    const concededMinutes = goalEvents
      .filter((e) =>
        e.detail === "Own Goal" ? e.teamId === teamEntry.team.id : e.teamId === opponentId,
      )
      .map((e) => e.minute + (e.extraMinute ?? 0));

    for (const p of teamEntry.players) {
      const stat = p.statistics[0];
      if (!stat) continue;
      const minutes = stat.games.minutes ?? 0;
      const stats = emptyStats();

      stats.minutes = minutes;
      stats.goals = stat.goals.total ?? 0;
      stats.assists = stat.goals.assists ?? 0;
      stats.yellowCards = stat.cards.yellow ?? 0;
      stats.redCards = stat.cards.red ?? 0;
      stats.saves = stat.goals.saves ?? 0;
      stats.tackles = stat.tackles.total ?? 0;
      stats.keyPasses = stat.passes.key ?? 0;
      stats.shotsOnTarget = stat.shots.on ?? 0;
      stats.penaltiesWon = stat.penalty.won ?? 0;
      stats.penaltiesCommitted = stat.penalty.commited ?? 0;
      stats.penaltiesSaved = stat.penalty.saved ?? 0;
      stats.ownGoals = ownGoalsByPlayer.get(p.player.id) ?? 0;
      stats.directFreeKickGoals = freeKickGoalsByPlayer.get(p.player.id) ?? 0;

      if (minutes > 0) {
        // On-pitch window: starters play from 0, subs from their entry minute.
        const started = !stat.games.substitute;
        const from = started ? 0 : (subInMinute.get(p.player.id) ?? Math.max(0, lastMinute - minutes));
        const to = subOutMinute.get(p.player.id) ?? lastMinute;
        const concededWhileOn = concededMinutes.filter((m) => m > from && m <= to).length;
        stats.goalsConceded = concededWhileOn;
        stats.cleanSheet = minutes >= 60 && concededWhileOn === 0;
      }

      byPlayer.set(p.player.id, {
        stats,
        position: mapPosition(stat.games.position),
        teamId: teamEntry.team.id,
      });
    }
  }

  return { byPlayer };
}
