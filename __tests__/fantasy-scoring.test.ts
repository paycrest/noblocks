import { applyAutoSubs } from "@/app/lib/fantasy/autosubs";
import {
  awardBonusPoints,
  computeNmbScore,
  winningGoalScorerId,
} from "@/app/lib/fantasy/bonus";
import {
  computePoints,
  computeSquadPoints,
  emptyStats,
  hasPlayed,
} from "@/app/lib/fantasy/scoring";
import type { FantasySettings, PlayerMatchStats, Position } from "@/app/lib/fantasy/types";

const settings = {
  defcon_def_threshold: 5,
  defcon_mid_fwd_threshold: 6,
} as Pick<FantasySettings, "defcon_def_threshold" | "defcon_mid_fwd_threshold">;

const matrix = {
  appearance: 1,
  appearance_60: 1,
  assist: 3,
  yellow_card: -1,
  red_card: -3,
  own_goal: -2,
  penalty_miss: -2,
  penalty_conceded: 0,
  goal: { GK: 10, DEF: 6, MID: 5, FWD: 4 } as Record<Position, number>,
  clean_sheet: { GK: 4, DEF: 4, MID: 1, FWD: 0 } as Record<Position, number>,
  goals_conceded_per_two: { GK: -1, DEF: -1, MID: 0, FWD: 0 } as Record<Position, number>,
  penalty_save: 5,
  saves_per_point: 3,
};

function stats(partial: Partial<PlayerMatchStats>): PlayerMatchStats {
  return { ...emptyStats(), ...partial };
}

describe("FPL computePoints", () => {
  it("scores GK goal as 10", () => {
    const { points } = computePoints(
      stats({ minutes: 90, goals: 1 }),
      "GK",
      matrix,
      settings,
    );
    expect(points).toBe(1 + 1 + 10); // appearance + 60 + goal
  });

  it("applies −1 per 2 GC for DEF", () => {
    const { points } = computePoints(
      stats({ minutes: 90, goalsConceded: 3 }),
      "DEF",
      matrix,
      settings,
    );
    expect(points).toBe(1 + 1 - 1);
  });

  it("pays BIT defcon at threshold", () => {
    const { points, breakdown } = computePoints(
      stats({ minutes: 90, blocks: 2, interceptions: 2, tackles: 1 }),
      "DEF",
      matrix,
      settings,
    );
    expect(breakdown.some((b) => b.reason === "Defensive contribution")).toBe(true);
    expect(points).toBe(1 + 1 + 2);
  });

  it("charges penalty miss −2", () => {
    const { points } = computePoints(
      stats({ minutes: 90, penaltiesMissed: 1 }),
      "FWD",
      matrix,
      settings,
    );
    expect(points).toBe(1 + 1 - 2);
  });
});

describe("hasPlayed / auto-subs", () => {
  it("treats card with 0 minutes as played", () => {
    expect(hasPlayed({ minutes: 0, yellowCards: 1, redCards: 0 })).toBe(true);
  });

  it("subs blank DEF with MID when formation allows", () => {
    const squad = [
      { playerId: 1, slot: 1, isCaptain: true, isVice: false, position: "GK" as const },
      { playerId: 2, slot: 2, isCaptain: false, isVice: true, position: "DEF" as const },
      { playerId: 3, slot: 3, isCaptain: false, isVice: false, position: "DEF" as const },
      { playerId: 4, slot: 4, isCaptain: false, isVice: false, position: "DEF" as const },
      { playerId: 5, slot: 5, isCaptain: false, isVice: false, position: "DEF" as const },
      { playerId: 6, slot: 6, isCaptain: false, isVice: false, position: "MID" as const },
      { playerId: 7, slot: 7, isCaptain: false, isVice: false, position: "MID" as const },
      { playerId: 8, slot: 8, isCaptain: false, isVice: false, position: "MID" as const },
      { playerId: 9, slot: 9, isCaptain: false, isVice: false, position: "MID" as const },
      { playerId: 10, slot: 10, isCaptain: false, isVice: false, position: "FWD" as const },
      { playerId: 11, slot: 11, isCaptain: false, isVice: false, position: "FWD" as const },
      { playerId: 12, slot: 12, isCaptain: false, isVice: false, position: "MID" as const },
      { playerId: 13, slot: 13, isCaptain: false, isVice: false, position: "FWD" as const },
      { playerId: 14, slot: 14, isCaptain: false, isVice: false, position: "DEF" as const },
      { playerId: 15, slot: 15, isCaptain: false, isVice: false, position: "GK" as const },
    ];
    const played = (id: number) => id !== 5; // blank 4th DEF; bench MID 12 played
    const xi = applyAutoSubs(squad, played);
    expect(xi.some((p) => p.playerId === 12)).toBe(true);
    expect(xi.some((p) => p.playerId === 5)).toBe(false);
    expect(xi.filter((p) => p.position === "DEF").length).toBeGreaterThanOrEqual(3);
  });
});

describe("C/VC with auto-subs", () => {
  it("does not double when both blank", () => {
    const squad = [
      { playerId: 1, slot: 1, isCaptain: true, isVice: false, position: "GK" as const },
      { playerId: 2, slot: 2, isCaptain: false, isVice: true, position: "DEF" as const },
      { playerId: 3, slot: 3, isCaptain: false, isVice: false, position: "DEF" as const },
      { playerId: 4, slot: 4, isCaptain: false, isVice: false, position: "DEF" as const },
      { playerId: 5, slot: 5, isCaptain: false, isVice: false, position: "MID" as const },
      { playerId: 6, slot: 6, isCaptain: false, isVice: false, position: "MID" as const },
      { playerId: 7, slot: 7, isCaptain: false, isVice: false, position: "MID" as const },
      { playerId: 8, slot: 8, isCaptain: false, isVice: false, position: "MID" as const },
      { playerId: 9, slot: 9, isCaptain: false, isVice: false, position: "MID" as const },
      { playerId: 10, slot: 10, isCaptain: false, isVice: false, position: "FWD" as const },
      { playerId: 11, slot: 11, isCaptain: false, isVice: false, position: "FWD" as const },
      { playerId: 12, slot: 12, isCaptain: false, isVice: false, position: "DEF" as const },
      { playerId: 13, slot: 13, isCaptain: false, isVice: false, position: "MID" as const },
      { playerId: 14, slot: 14, isCaptain: false, isVice: false, position: "FWD" as const },
      { playerId: 15, slot: 15, isCaptain: false, isVice: false, position: "GK" as const },
    ];
    const playerPoints = new Map(
      squad.map((p) => [
        p.playerId,
        {
          points: p.playerId === 1 || p.playerId === 2 ? 0 : 2,
          minutes: p.playerId === 1 || p.playerId === 2 ? 0 : 90,
          yellowCards: 0,
          redCards: 0,
        },
      ]),
    );
    const { points } = computeSquadPoints(
      { squad, playerPoints, transferPointsDeduction: 0 },
      applyAutoSubs,
    );
    // 9 outfield players who played × 2 (GK blank, captain blank, vice blank; one DEF may autosub)
    expect(points).toBeGreaterThan(0);
    // No captain double on blanks
    const baseWithoutDouble = [...playerPoints.values()]
      .filter((p) => p.minutes > 0)
      .reduce((s, p) => s + p.points, 0);
    // After autosub still no double if C/VC blank
    expect(points).toBeLessThanOrEqual(baseWithoutDouble);
  });
});

describe("NMB", () => {
  it("winning goal is loser+1 ordinal", () => {
    // 3-1 home win → home's 2nd goal
    expect(
      winningGoalScorerId(1, 2, 3, 1, [10, 20, 30], [99]),
    ).toBe(20);
    expect(winningGoalScorerId(1, 2, 1, 1, [10], [20])).toBeNull();
  });

  it("awards 3/2/1 with first-place tie → 3/3/1", () => {
    const map = awardBonusPoints([
      { playerId: 1, nmb: 50, minutes: 90 },
      { playerId: 2, nmb: 50, minutes: 90 },
      { playerId: 3, nmb: 40, minutes: 90 },
    ]);
    expect(map.get(1)).toBe(3);
    expect(map.get(2)).toBe(3);
    expect(map.get(3)).toBe(1);
  });

  it("computes open-play vs pen goal differently", () => {
    const s = stats({ minutes: 90, goals: 2, penaltiesScored: 1 });
    const nmb = computeNmbScore("MID", s, { isWinningGoalScorer: false });
    // 6 (60+) + 12 pen + 18 open-play
    expect(nmb).toBe(6 + 12 + 18);
  });
});
