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
export const EPL_LEAGUE_ID = 39;
export const EPL_SEASON = 2026;
/** Matchday ids are 100 + gameweek (GW1 → 101). */
export const EPL_MATCHDAY_OFFSET = 100;

/** Parse API-Football round e.g. "Regular Season - 12" → matchday id 112. */
export function roundToMatchdayId(round: string): number | null {
  const m = /Regular Season\s*-\s*(\d+)/i.exec(round);
  if (!m) return null;
  const gw = Number(m[1]);
  if (!Number.isFinite(gw) || gw < 1 || gw > 38) return null;
  return EPL_MATCHDAY_OFFSET + gw;
}

/** @deprecated use roundToMatchdayId — kept name for fewer call-site churns during cutover */
export function ROUND_TO_MATCHDAY_LOOKUP(round: string): number | undefined {
  return roundToMatchdayId(round) ?? undefined;
}

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
  /**
   * For Goal events this is the team the goal counts FOR — including own
   * goals, where the player is from the OTHER side (verified against live
   * EPL fixtures, e.g. an OG by a Man Utd defender arrives with Tottenham's
   * team id). Cards/substitutions carry the involved player's own team.
   */
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
      passes: { total: number | null; key: number | null; accuracy: string | number | null };
      tackles: { total: number | null; blocks: number | null; interceptions: number | null };
      dribbles: { success: number | null } | null;
      fouls: { drawn: number | null; committed: number | null } | null;
      cards: { yellow: number | null; red: number | null };
      penalty: {
        won: number | null;
        commited: number | null;
        scored: number | null;
        missed: number | null;
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

/** All EPL fixtures for the season (one call). */
export async function getLeagueFixtures(): Promise<ProviderFixture[]> {
  const raw = await apiGet<RawFixture>("/fixtures", {
    league: EPL_LEAGUE_ID,
    season: EPL_SEASON,
  });
  return raw.map(mapFixture);
}

/** @deprecated alias */
export const getWorldCupFixtures = getLeagueFixtures;

/** Currently-live EPL fixtures (one call). */
export async function getLiveLeagueFixtures(): Promise<ProviderFixture[]> {
  const raw = await apiGet<RawFixture>("/fixtures", {
    live: "all",
    league: EPL_LEAGUE_ID,
  });
  return raw.map(mapFixture);
}

export const getLiveWorldCupFixtures = getLiveLeagueFixtures;

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

/** Null / unknown provider positions score as MID (NMB + fantasy points). */
export function mapPositionOrMid(raw: string | Position | null | undefined): Position {
  if (raw === "GK" || raw === "DEF" || raw === "MID" || raw === "FWD") return raw;
  return mapPosition(raw ?? null) ?? "MID";
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
    url.searchParams.set("season", String(EPL_SEASON));
    url.searchParams.set("league", String(EPL_LEAGUE_ID));
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
 * Merge /fixtures/players + /fixtures/events into scoring stats.
 * CS / GC use on-pitch windows (goal at exact sub minute charges outgoing).
 * penalty.missed: vendor field; also count Missed Penalty events for the taker
 * (covers saved + off-target for FPL −2).
 * passes.accuracy is 0–100 (string or number from API-Football).
 * penalty.scored ⊆ goals.total (spike-confirmed) → open-play = goals - scored.
 */
export async function getNormalizedFixtureStats(
  fixtureId: number,
): Promise<NormalizedFixtureStats> {
  const [playersRaw, events] = await Promise.all([
    apiGet<RawFixturePlayers>("/fixtures/players", { fixture: fixtureId }),
    getFixtureEvents(fixtureId),
  ]);

  const scoringEvents = events.filter((e) => !isShootoutEvent(e));

  const subOutMinute = new Map<number, number>();
  const subInMinute = new Map<number, number>();
  for (const e of scoringEvents) {
    if (e.type.toLowerCase() !== "subst") continue;
    const minute = e.minute + (e.extraMinute ?? 0);
    if (e.playerId != null) subOutMinute.set(e.playerId, minute);
    if (e.assistPlayerId != null) subInMinute.set(e.assistPlayerId, minute);
  }

  const goalEvents = scoringEvents.filter(
    (e) => e.type === "Goal" && e.detail !== "Missed Penalty",
  );
  const missedPenaltyByPlayer = new Map<number, number>();
  for (const e of scoringEvents) {
    if (e.playerId == null) continue;
    if (e.type === "Goal" && e.detail === "Missed Penalty") {
      missedPenaltyByPlayer.set(e.playerId, (missedPenaltyByPlayer.get(e.playerId) ?? 0) + 1);
    }
  }

  const ownGoalsByPlayer = new Map<number, number>();
  for (const e of goalEvents) {
    if (e.playerId == null) continue;
    if (e.detail === "Own Goal") {
      ownGoalsByPlayer.set(e.playerId, (ownGoalsByPlayer.get(e.playerId) ?? 0) + 1);
    }
  }

  const teamIds = playersRaw.map((t) => t.team.id);
  const byPlayer: NormalizedFixtureStats["byPlayer"] = new Map();

  const lastMinute = Math.max(
    90,
    ...scoringEvents.map((e) => e.minute + (e.extraMinute ?? 0)),
  );

  for (const teamEntry of playersRaw) {
    const opponentId = teamIds.find((id) => id !== teamEntry.team.id);
    if (opponentId == null) {
      throw new Error(
        `Fixture players payload missing opponent team (team ${teamEntry.team.id})`,
      );
    }
    // (verified against live EPL fixtures: an OG event lists the team the
    // goal counts FOR, with the opposing scorer as player). So a team
    // concedes exactly the goals credited to its opponent; no OG special
    // case, or the beneficiary's GK would lose a clean sheet they kept.
    const concededMinutes = goalEvents
      .filter((e) => e.teamId === opponentId)
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
      stats.blocks = stat.tackles.blocks ?? 0;
      stats.interceptions = stat.tackles.interceptions ?? 0;
      stats.keyPasses = stat.passes.key ?? 0;
      stats.passesTotal = stat.passes.total ?? 0;
      const accRaw = stat.passes.accuracy;
      stats.passesAccuracy =
        typeof accRaw === "string" ? Number(accRaw) || 0 : typeof accRaw === "number" ? accRaw : 0;
      stats.shotsTotal = stat.shots.total ?? 0;
      stats.shotsOnTarget = stat.shots.on ?? 0;
      stats.dribblesSuccess = stat.dribbles?.success ?? 0;
      stats.foulsDrawn = stat.fouls?.drawn ?? 0;
      stats.foulsCommitted = stat.fouls?.committed ?? 0;
      stats.penaltiesScored = stat.penalty.scored ?? 0;
      stats.penaltiesCommitted = stat.penalty.commited ?? 0;
      stats.penaltiesSaved = stat.penalty.saved ?? 0;
      const missedStat = stat.penalty.missed ?? 0;
      const missedEvt = missedPenaltyByPlayer.get(p.player.id) ?? 0;
      stats.penaltiesMissed = Math.max(missedStat, missedEvt);
      stats.ownGoals = ownGoalsByPlayer.get(p.player.id) ?? 0;

      if (minutes > 0) {
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

/**
 * Goal order per team, chronological, for the NMB winning-goal ordinal.
 * EVERY goal that moves the score stays in the tally so the array always
 * lines up with the final score the ordinal is derived from — dropping any
 * would shift every later goal one place and mis-award the +3. Goals without
 * an attributable scorer (own goals; feed gaps with a null player id) carry
 * scorer null: a null at the ordinal means nobody gets the bonus.
 */
export function goalScorerOrdersFromEvents(
  events: ProviderEvent[],
  homeTeamId: number,
  awayTeamId: number,
): { home: (number | null)[]; away: (number | null)[] } {
  const scoring = events.filter(
    (e) =>
      !isShootoutEvent(e) && e.type === "Goal" && e.detail !== "Missed Penalty",
  );
  scoring.sort(
    (a, b) => a.minute + (a.extraMinute ?? 0) - (b.minute + (b.extraMinute ?? 0)),
  );
  const home: (number | null)[] = [];
  const away: (number | null)[] = [];
  for (const e of scoring) {
    const scorer = e.detail === "Own Goal" ? null : e.playerId;
    if (e.teamId === homeTeamId) home.push(scorer);
    else if (e.teamId === awayTeamId) away.push(scorer);
  }
  return { home, away };
}
