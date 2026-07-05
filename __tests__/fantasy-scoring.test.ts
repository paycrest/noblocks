import {
  computePoints,
  computeSquadPoints,
  emptyStats,
} from "../app/lib/fantasy/scoring";
import type { PlayerMatchStats, ScoringMatrix } from "../app/lib/fantasy/types";

// Mirrors the fantasy_settings seed (migration 20260704120001) — the exact
// matrix transcribed from the official guidelines in TRD §6.6.
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

const stats = (overrides: Partial<PlayerMatchStats>): PlayerMatchStats => ({
  ...emptyStats(),
  ...overrides,
});

describe("computePoints", () => {
  it("scores zero for a player who did not play", () => {
    const { points, breakdown } = computePoints(stats({ goals: 2 }), "FWD", matrix);
    expect(points).toBe(0);
    expect(breakdown).toHaveLength(0);
  });

  it("scores appearance points: +1 under 60 min, +2 for 60+", () => {
    expect(computePoints(stats({ minutes: 30 }), "MID", matrix).points).toBe(1);
    expect(computePoints(stats({ minutes: 60 }), "MID", matrix).points).toBe(2);
    expect(computePoints(stats({ minutes: 90 }), "MID", matrix).points).toBe(2);
  });

  it("scores goals by position", () => {
    const base = 2; // 90 min appearance
    expect(computePoints(stats({ minutes: 90, goals: 1 }), "GK", matrix).points).toBe(base + 9);
    expect(computePoints(stats({ minutes: 90, goals: 1 }), "DEF", matrix).points).toBe(base + 7);
    expect(
      computePoints(stats({ minutes: 90, goals: 1, cleanSheet: true }), "MID", matrix).points,
    ).toBe(base + 6 + 1);
    expect(computePoints(stats({ minutes: 90, goals: 2 }), "FWD", matrix).points).toBe(base + 10);
  });

  it("awards clean sheets only at 60+ minutes", () => {
    expect(
      computePoints(stats({ minutes: 59, cleanSheet: true }), "DEF", matrix).points,
    ).toBe(1);
    expect(
      computePoints(stats({ minutes: 60, cleanSheet: true }), "DEF", matrix).points,
    ).toBe(2 + 5);
    // FWD gets nothing for clean sheets
    expect(
      computePoints(stats({ minutes: 90, cleanSheet: true }), "FWD", matrix).points,
    ).toBe(2);
  });

  it("gives the first goal conceded free, then −1 per extra (GK/DEF only)", () => {
    expect(computePoints(stats({ minutes: 90, goalsConceded: 1 }), "GK", matrix).points).toBe(2);
    expect(computePoints(stats({ minutes: 90, goalsConceded: 3 }), "GK", matrix).points).toBe(0);
    expect(computePoints(stats({ minutes: 90, goalsConceded: 3 }), "DEF", matrix).points).toBe(0);
    expect(computePoints(stats({ minutes: 90, goalsConceded: 3 }), "MID", matrix).points).toBe(2);
  });

  it("scores GK specials: penalty saves and every 3 saves", () => {
    const { points } = computePoints(
      stats({ minutes: 90, penaltiesSaved: 1, saves: 7, cleanSheet: true }),
      "GK",
      matrix,
    );
    // 2 appearance + 3 pen save + 2 (7 saves → floor 7/3) + 5 clean sheet
    expect(points).toBe(12);
  });

  it("scores MID specials: every 3 tackles, every 2 key passes", () => {
    const { points } = computePoints(
      stats({ minutes: 90, tackles: 6, keyPasses: 5 }),
      "MID",
      matrix,
    );
    // 2 appearance + 2 tackles + 2 key passes
    expect(points).toBe(6);
  });

  it("scores FWD specials: every 2 shots on target", () => {
    const { points } = computePoints(stats({ minutes: 90, shotsOnTarget: 5 }), "FWD", matrix);
    expect(points).toBe(2 + 2);
  });

  it("applies penalties, cards and own goals", () => {
    const { points } = computePoints(
      stats({
        minutes: 90,
        yellowCards: 1,
        redCards: 1,
        ownGoals: 1,
        penaltiesWon: 1,
        penaltiesCommitted: 1,
      }),
      "DEF",
      matrix,
    );
    // 2 − 1 − 2 − 2 + 2 − 1
    expect(points).toBe(-2);
  });

  it("adds the direct free-kick bonus on top of goal points", () => {
    const { points } = computePoints(
      stats({ minutes: 90, goals: 1, directFreeKickGoals: 1 }),
      "MID",
      matrix,
    );
    expect(points).toBe(2 + 6 + 1);
  });

  it("recomputes deterministically from raw stats (idempotent)", () => {
    const input = stats({ minutes: 90, goals: 1, assists: 2, tackles: 4 });
    const a = computePoints(input, "MID", matrix);
    const b = computePoints(input, "MID", matrix);
    expect(a).toEqual(b);
  });
});

describe("computeSquadPoints", () => {
  const xi = (captainId: number, viceId: number) =>
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((id) => ({
      playerId: id,
      isCaptain: id === captainId,
      isVice: id === viceId,
    }));

  const pointsMap = (entries: [number, number, number][]) =>
    new Map(entries.map(([id, points, minutes]) => [id, { points, minutes }]));

  it("doubles the captain when they played", () => {
    const total = computeSquadPoints({
      startingXI: xi(1, 2),
      playerPoints: pointsMap([
        [1, 10, 90],
        [2, 6, 90],
      ]),
      transferPointsDeduction: 0,
    });
    expect(total).toBe(10 + 6 + 10);
  });

  it("falls back to the vice unconditionally when the captain played 0 minutes", () => {
    const total = computeSquadPoints({
      startingXI: xi(1, 2),
      playerPoints: pointsMap([
        [1, 0, 0],
        [2, 6, 90],
      ]),
      transferPointsDeduction: 0,
    });
    expect(total).toBe(6 + 6);
  });

  it("ignores the bench entirely (auto-subs dropped) and applies transfer deductions", () => {
    const total = computeSquadPoints({
      startingXI: xi(1, 2),
      playerPoints: pointsMap([
        [1, 4, 90],
        [2, 2, 90],
        [12, 99, 90], // bench player never counts
      ]),
      transferPointsDeduction: 6,
    });
    expect(total).toBe(4 + 2 + 4 - 6);
  });
});
