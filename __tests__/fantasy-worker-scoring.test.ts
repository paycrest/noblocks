/**
 * Worker scoring integration: stubbed API-Football payloads →
 * getNormalizedFixtureStats → computePoints → computeSquadPoints — the exact
 * pipeline app/lib/fantasy/worker.ts runs on every stats sync.
 */
import { readFileSync } from "fs";
import path from "path";

import { applyAutoSubs } from "@/app/lib/fantasy/autosubs";
import { getNormalizedFixtureStats } from "@/app/lib/fantasy/provider";
import { computePoints, computeSquadPoints } from "@/app/lib/fantasy/scoring";
import type { FantasySettings, ScoringMatrix } from "@/app/lib/fantasy/types";

const matrix: ScoringMatrix = {
  appearance: 1,
  appearance_60: 1,
  assist: 3,
  yellow_card: -1,
  red_card: -3,
  own_goal: -2,
  penalty_miss: -2,
  penalty_conceded: 0,
  goal: { GK: 10, DEF: 6, MID: 5, FWD: 4 },
  clean_sheet: { GK: 4, DEF: 4, MID: 1, FWD: 0 },
  goals_conceded_per_two: { GK: -1, DEF: -1, MID: 0, FWD: 0 },
  penalty_save: 5,
  saves_per_point: 3,
};

const defcon = {
  defcon_def_threshold: 5,
  defcon_mid_fwd_threshold: 6,
} as Pick<FantasySettings, "defcon_def_threshold" | "defcon_mid_fwd_threshold">;

const TEAM_A = 100;
const TEAM_B = 200;

const playerStats = (over: Record<string, unknown> = {}) => ({
  games: { minutes: 90, position: "M", substitute: false, ...(over.games as object) },
  shots: { total: null, on: null },
  goals: { total: null, conceded: null, assists: null, saves: null },
  passes: { key: null, total: null, accuracy: null },
  tackles: { total: null, blocks: null, interceptions: null },
  dribbles: { success: null },
  fouls: { drawn: null, committed: null },
  cards: { yellow: null, red: null },
  penalty: { won: null, commited: null, saved: null, missed: null, scored: null },
  ...over,
});

/** /fixtures/players payload: team A wins 2-0 in regulation (one OG by B). */
const playersPayload = [
  {
    team: { id: TEAM_A, name: "Team A" },
    players: [
      {
        player: { id: 10, name: "GK A" },
        statistics: [
          playerStats({
            games: { minutes: 90, position: "G", substitute: false },
            goals: { total: null, conceded: 0, assists: null, saves: 4 },
          }),
        ],
      },
      {
        player: { id: 1, name: "Mid A" },
        statistics: [
          playerStats({
            games: { minutes: 90, position: "M", substitute: false },
            goals: { total: 1, conceded: null, assists: null, saves: null },
            passes: { key: 4, total: 40, accuracy: "85" },
            tackles: { total: 3, blocks: 0, interceptions: 0 },
          }),
        ],
      },
      {
        player: { id: 3, name: "Def A out 60" },
        statistics: [playerStats({ games: { minutes: 60, position: "D", substitute: false } })],
      },
      {
        player: { id: 4, name: "Def A sub in 60" },
        statistics: [playerStats({ games: { minutes: 30, position: "D", substitute: true } })],
      },
    ],
  },
  {
    team: { id: TEAM_B, name: "Team B" },
    players: [
      {
        player: { id: 20, name: "GK B" },
        statistics: [
          playerStats({
            games: { minutes: 90, position: "G", substitute: false },
            goals: { total: null, conceded: 2, assists: null, saves: 6 },
          }),
        ],
      },
      {
        player: { id: 5, name: "Def B own goal" },
        statistics: [playerStats({ games: { minutes: 90, position: "D", substitute: false } })],
      },
    ],
  },
];

const eventsPayload = [
  {
    time: { elapsed: 30, extra: null },
    team: { id: TEAM_A },
    player: { id: 1 },
    assist: { id: null },
    type: "Goal",
    detail: "Normal Goal",
    comments: null,
  },
  {
    // OG events carry the BENEFITING team (A), with the scorer (B's defender)
    // as the player — verified against live API-Football EPL payloads.
    time: { elapsed: 50, extra: null },
    team: { id: TEAM_A },
    player: { id: 5 },
    assist: { id: null },
    type: "Goal",
    detail: "Own Goal",
    comments: null,
  },
  {
    time: { elapsed: 60, extra: null },
    team: { id: TEAM_A },
    player: { id: 3 },
    assist: { id: 4 },
    type: "subst",
    detail: "Substitution 1",
    comments: null,
  },
  {
    time: { elapsed: 120, extra: null },
    team: { id: TEAM_B },
    player: { id: 20 },
    assist: { id: null },
    type: "Goal",
    detail: "Penalty",
    comments: "Penalty Shootout",
  },
];

beforeAll(() => {
  process.env.API_FOOTBALL_KEY = "test-key";
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const response = url.includes("/fixtures/players")
      ? playersPayload
      : url.includes("/fixtures/events")
        ? eventsPayload
        : [];
    return {
      ok: true,
      headers: { get: () => null },
      json: async () => ({ errors: [], response }),
    } as unknown as Response;
  }) as jest.Mock;
});

afterAll(() => {
  (global.fetch as jest.Mock).mockRestore?.();
});

describe("stats normalization from stubbed provider", () => {
  it("derives clean sheets, conceded windows, OG; excludes shootout", async () => {
    const { byPlayer } = await getNormalizedFixtureStats(9001);

    const gkA = byPlayer.get(10)!;
    expect(gkA.position).toBe("GK");
    expect(gkA.stats.cleanSheet).toBe(true);
    expect(gkA.stats.goalsConceded).toBe(0);
    expect(gkA.stats.saves).toBe(4);

    const midA = byPlayer.get(1)!;
    expect(midA.stats.goals).toBe(1);
    expect(midA.stats.keyPasses).toBe(4);
    expect(midA.stats.cleanSheet).toBe(true);

    expect(byPlayer.get(3)!.stats.cleanSheet).toBe(true);
    expect(byPlayer.get(4)!.stats.cleanSheet).toBe(false);
    expect(byPlayer.get(4)!.stats.goalsConceded).toBe(0);

    const gkB = byPlayer.get(20)!;
    expect(gkB.stats.goalsConceded).toBe(2);
    expect(gkB.stats.cleanSheet).toBe(false);
    const defB = byPlayer.get(5)!;
    expect(defB.stats.ownGoals).toBe(1);
    expect(defB.stats.goalsConceded).toBe(2);
  });

  it("scores the normalized stats with the FPL matrix", async () => {
    const { byPlayer } = await getNormalizedFixtureStats(9001);

    // MID: 1+1 appearance + 5 goal + 1 CS = 8 (BIT 3 < 6, no defcon)
    const midA = computePoints(byPlayer.get(1)!.stats, "MID", matrix, defcon);
    expect(midA.points).toBe(8);

    // GK A: 1+1 + 4 CS + floor(4/3)=1 save = 7
    expect(computePoints(byPlayer.get(10)!.stats, "GK", matrix, defcon).points).toBe(7);

    // GK B: 1+1 + floor(6/3)=2 saves −1 (2 GC / 2) = 3
    expect(computePoints(byPlayer.get(20)!.stats, "GK", matrix, defcon).points).toBe(3);

    // DEF B: 1+1 −2 OG −1 (2 GC) = −1
    expect(computePoints(byPlayer.get(5)!.stats, "DEF", matrix, defcon).points).toBe(-1);
  });

  it("aggregates a squad with captain doubling, auto-subs, and transfer deduction", async () => {
    const { byPlayer } = await getNormalizedFixtureStats(9001);
    const playerPoints = new Map(
      [...byPlayer.entries()].map(([id, entry]) => {
        const position = entry.position ?? "MID";
        return [
          id,
          {
            points: computePoints(entry.stats, position, matrix, defcon).points,
            minutes: entry.stats.minutes,
            yellowCards: entry.stats.yellowCards,
            redCards: entry.stats.redCards,
          },
        ] as const;
      }),
    );

    const { points } = computeSquadPoints(
      {
        squad: [
          { playerId: 1, slot: 1, isCaptain: true, isVice: false, position: "MID" },
          { playerId: 10, slot: 2, isCaptain: false, isVice: true, position: "GK" },
          { playerId: 20, slot: 3, isCaptain: false, isVice: false, position: "GK" },
          { playerId: 5, slot: 4, isCaptain: false, isVice: false, position: "DEF" },
          { playerId: 3, slot: 5, isCaptain: false, isVice: false, position: "DEF" },
          { playerId: 4, slot: 6, isCaptain: false, isVice: false, position: "DEF" },
          // pad to XI with zero-minute placeholders not in byPlayer
          { playerId: 101, slot: 7, isCaptain: false, isVice: false, position: "MID" },
          { playerId: 102, slot: 8, isCaptain: false, isVice: false, position: "MID" },
          { playerId: 103, slot: 9, isCaptain: false, isVice: false, position: "MID" },
          { playerId: 104, slot: 10, isCaptain: false, isVice: false, position: "FWD" },
          { playerId: 105, slot: 11, isCaptain: false, isVice: false, position: "FWD" },
        ],
        playerPoints,
        transferPointsDeduction: 4,
      },
      applyAutoSubs,
    );

    // Live scorers: 8+7+3+(-1)+ (def3 CS: 1+1+4=6) + (def4: 1 app only =1) = 24
    // +8 captain double −4 transfers = 28
    expect(points).toBe(28);
  });
});

describe("worker safety controls", () => {
  // Source-level guards: these protect invariants that no unit test can reach
  // because they live in env wiring and SQL. Deleting either is silent at
  // runtime, so pin the source.
  const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

  it("timelapse stat fabrication is hard-gated on NODE_ENV", () => {
    // Timelapse writes deterministic fake stats. Those feed real scores and a
    // prize-bearing leaderboard, so the env var alone must never enable it.
    const worker = read("app/lib/fantasy/worker.ts");
    const decl = worker.slice(worker.indexOf("const LOCAL_TIMELAPSE"));
    expect(decl).toMatch(/NODE_ENV\s*!==\s*"production"/);
  });

  it("the worker run lock releases only on a matching token", () => {
    // A slow tick whose claim was already reclaimed as stale must not clear
    // its successor's — that fails open in exactly the case the lock is for.
    const migration = read(
      "supabase/migrations/20260811120000_epl_fantasy_season.sql",
    );
    const acquire = migration.slice(
      migration.indexOf("FUNCTION public.fantasy_worker_try_acquire"),
    );
    const release = migration.slice(
      migration.indexOf("FUNCTION public.fantasy_worker_release"),
    );

    expect(acquire).toContain("gen_random_uuid()");
    expect(acquire).toMatch(/RETURNING\s+token\s+INTO/);
    // uuid, not the started_at timestamp: timestamp equality would ride on
    // microsecond precision surviving the JSON round trip, and a truncating
    // serializer would turn release into a silent permanent no-op.
    expect(release).toContain("p_token UUID");
    expect(release).toMatch(/started_at\s*=\s*NULL[\s\S]{0,200}token\s*=\s*p_token/);
  });
});
