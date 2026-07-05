/**
 * Worker scoring integration: stubbed API-Football payloads →
 * getNormalizedFixtureStats → computePoints → computeSquadPoints — the exact
 * pipeline app/lib/fantasy/worker.ts runs on every stats sync.
 */
import { getNormalizedFixtureStats } from "@/app/lib/fantasy/provider";
import { computePoints, computeSquadPoints } from "@/app/lib/fantasy/scoring";
import type { ScoringMatrix } from "@/app/lib/fantasy/types";

const matrix: ScoringMatrix = {
  appearance: 1,
  appearance_60: 1,
  assist: 3,
  yellow_card: -1,
  red_card: -2,
  own_goal: -2,
  penalty_won: 2,
  penalty_conceded: -1,
  goal: { GK: 9, DEF: 7, MID: 6, FWD: 5 },
  clean_sheet: { GK: 5, DEF: 5, MID: 1, FWD: 0 },
  goals_conceded_per_extra: { GK: -1, DEF: -1, MID: 0, FWD: 0 },
  penalty_save: 3,
  saves_per_point: 3,
  tackles_per_point: 3,
  key_passes_per_point: 2,
  shots_on_target_per_point: 2,
  direct_free_kick_goal: 1,
};

const TEAM_A = 100;
const TEAM_B = 200;

const playerStats = (over: Record<string, unknown> = {}) => ({
  games: { minutes: 90, position: "M", substitute: false, ...(over.games as object) },
  shots: { total: null, on: null },
  goals: { total: null, conceded: null, assists: null, saves: null },
  passes: { key: null },
  tackles: { total: null },
  cards: { yellow: null, red: null },
  penalty: { won: null, commited: null, saved: null },
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
          playerStats({ games: { minutes: 90, position: "G", substitute: false }, goals: { total: null, conceded: 0, assists: null, saves: 4 } }),
        ],
      },
      {
        player: { id: 1, name: "Mid A" },
        statistics: [
          playerStats({
            games: { minutes: 90, position: "M", substitute: false },
            goals: { total: 1, conceded: null, assists: null, saves: null },
            passes: { key: 4 },
            tackles: { total: 3 },
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
          playerStats({ games: { minutes: 90, position: "G", substitute: false }, goals: { total: null, conceded: 2, assists: null, saves: 6 } }),
        ],
      },
      {
        player: { id: 5, name: "Def B own goal" },
        statistics: [playerStats({ games: { minutes: 90, position: "D", substitute: false } })],
      },
    ],
  },
];

/** /fixtures/events payload: FK goal 30', OG 50', sub 60', shootout noise. */
const eventsPayload = [
  {
    time: { elapsed: 30, extra: null },
    team: { id: TEAM_A },
    player: { id: 1 },
    assist: { id: null },
    type: "Goal",
    detail: "Normal Goal",
    comments: "Direct free-kick",
  },
  {
    time: { elapsed: 50, extra: null },
    team: { id: TEAM_B },
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
  // Shootout events must be excluded from all scoring-relevant derivations.
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
  it("derives clean sheets, conceded windows, OG and FK bonus; excludes shootout", async () => {
    const { byPlayer } = await getNormalizedFixtureStats(9001);

    // Team A conceded nothing (the OG counts against Team B).
    const gkA = byPlayer.get(10)!;
    expect(gkA.position).toBe("GK");
    expect(gkA.stats.cleanSheet).toBe(true);
    expect(gkA.stats.goalsConceded).toBe(0);
    expect(gkA.stats.saves).toBe(4);

    // Scorer: goal from player stats, FK bonus detected from event comments.
    const midA = byPlayer.get(1)!;
    expect(midA.stats.goals).toBe(1);
    expect(midA.stats.directFreeKickGoals).toBe(1);
    expect(midA.stats.keyPasses).toBe(4);
    expect(midA.stats.cleanSheet).toBe(true);

    // Sub window: out at 60' with exactly 60 min still earns the clean sheet;
    // the 30-min replacement does not (< 60 min).
    expect(byPlayer.get(3)!.stats.cleanSheet).toBe(true);
    expect(byPlayer.get(4)!.stats.cleanSheet).toBe(false);
    expect(byPlayer.get(4)!.stats.goalsConceded).toBe(0);

    // Team B conceded twice (regulation goal + own goal), shootout excluded.
    const gkB = byPlayer.get(20)!;
    expect(gkB.stats.goalsConceded).toBe(2);
    expect(gkB.stats.cleanSheet).toBe(false);
    const defB = byPlayer.get(5)!;
    expect(defB.stats.ownGoals).toBe(1);
    expect(defB.stats.goalsConceded).toBe(2);
  });

  it("scores the normalized stats exactly as the worker would", async () => {
    const { byPlayer } = await getNormalizedFixtureStats(9001);

    // MID scorer: 2 appearance + 6 goal + 1 FK + 1 CS + 1 (3 tackles) + 2 (4 key passes) = 13
    const midA = computePoints(byPlayer.get(1)!.stats, "MID", matrix);
    expect(midA.points).toBe(13);

    // GK A: 2 appearance + 5 CS + 1 (4 saves → floor 4/3) = 8
    expect(computePoints(byPlayer.get(10)!.stats, "GK", matrix).points).toBe(8);

    // GK B: 2 appearance + 2 (6 saves) − 1 (second goal conceded) = 3
    expect(computePoints(byPlayer.get(20)!.stats, "GK", matrix).points).toBe(3);

    // DEF B: 2 appearance − 2 OG − 1 extra conceded = −1
    expect(computePoints(byPlayer.get(5)!.stats, "DEF", matrix).points).toBe(-1);
  });

  it("aggregates a squad with captain doubling and transfer deduction", async () => {
    const { byPlayer } = await getNormalizedFixtureStats(9001);
    const playerPoints = new Map(
      [...byPlayer.entries()].map(([id, entry]) => {
        const position = entry.position ?? "MID";
        return [
          id,
          {
            points: computePoints(entry.stats, position, matrix).points,
            minutes: entry.stats.minutes,
          },
        ] as const;
      }),
    );

    const total = computeSquadPoints({
      startingXI: [
        { playerId: 1, isCaptain: true, isVice: false }, // 13, doubled
        { playerId: 10, isCaptain: false, isVice: true }, // 8
        { playerId: 20, isCaptain: false, isVice: false }, // 3
        { playerId: 5, isCaptain: false, isVice: false }, // −1
      ],
      playerPoints,
      transferPointsDeduction: 3,
    });
    // 13 + 8 + 3 − 1 = 23, +13 captain double, −3 transfers = 33
    expect(total).toBe(33);
  });
});
