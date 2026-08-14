/**
 * Noblocks Match Bonus (NMB) — eligibility, FPL tie rules, and the
 * winning-goal ordinal including own goals.
 */
jest.mock("server-only", () => ({}));

import {
  awardBonusPoints,
  computeNmbScore,
  winningGoalScorerId,
} from "@/app/lib/fantasy/bonus";
import { goalScorerOrdersFromEvents } from "@/app/lib/fantasy/provider";
import { emptyStats } from "@/app/lib/fantasy/scoring";

const r = (playerId: number, nmb: number, minutes = 90) => ({ playerId, nmb, minutes });

describe("awardBonusPoints — eligibility", () => {
  it("players with 0 minutes are never ranked", () => {
    const out = awardBonusPoints([r(1, 30), r(2, 20), r(3, -5, 12), r(99, 0, 0)]);
    expect(out.get(99)).toBeUndefined();
    expect(out.get(1)).toBe(3);
    expect(out.get(2)).toBe(2);
    expect(out.get(3)).toBe(1);
  });

  it("all-blank feed awards nothing", () => {
    const out = awardBonusPoints([r(1, 0, 0), r(2, 0, 0)]);
    expect(out.size).toBe(0);
  });
});

describe("awardBonusPoints — FPL tie rules", () => {
  it("no ties: 3 / 2 / 1", () => {
    const out = awardBonusPoints([r(1, 30), r(2, 20), r(3, 10), r(4, 5)]);
    expect(out.get(1)).toBe(3);
    expect(out.get(2)).toBe(2);
    expect(out.get(3)).toBe(1);
    expect(out.get(4)).toBeUndefined();
  });

  it("tie for 1st: both 3, next gets 1 (2 is skipped)", () => {
    const out = awardBonusPoints([r(1, 30), r(2, 30), r(3, 20), r(4, 10)]);
    expect(out.get(1)).toBe(3);
    expect(out.get(2)).toBe(3);
    expect(out.get(3)).toBe(1);
    expect(out.get(4)).toBeUndefined();
  });

  it("tie for 2nd: 3, then both 2 (1 is skipped)", () => {
    const out = awardBonusPoints([r(1, 30), r(2, 20), r(3, 20), r(4, 10)]);
    expect(out.get(1)).toBe(3);
    expect(out.get(2)).toBe(2);
    expect(out.get(3)).toBe(2);
    expect(out.get(4)).toBeUndefined();
  });

  it("tie for 3rd: 3, 2, then both 1", () => {
    const out = awardBonusPoints([r(1, 30), r(2, 20), r(3, 10), r(4, 10), r(5, 5)]);
    expect(out.get(1)).toBe(3);
    expect(out.get(2)).toBe(2);
    expect(out.get(3)).toBe(1);
    expect(out.get(4)).toBe(1);
    expect(out.get(5)).toBeUndefined();
  });
});

describe("computeNmbScore", () => {
  it("scores 0 for a player with no minutes and no negative events", () => {
    expect(computeNmbScore("MID", emptyStats(), { isWinningGoalScorer: false })).toBe(0);
  });

  it("appearance: <60' = +3, ≥60' = +6", () => {
    const short = { ...emptyStats(), minutes: 30 };
    const full = { ...emptyStats(), minutes: 90 };
    expect(computeNmbScore("MID", short, { isWinningGoalScorer: false })).toBe(3);
    expect(computeNmbScore("MID", full, { isWinningGoalScorer: false })).toBe(6);
  });

  it("open-play goals scale by position: FWD 24 > MID 18 > DEF 12", () => {
    const stats = { ...emptyStats(), minutes: 90, goals: 1 };
    const base = 6;
    expect(computeNmbScore("FWD", stats, { isWinningGoalScorer: false })).toBe(base + 24);
    expect(computeNmbScore("MID", stats, { isWinningGoalScorer: false })).toBe(base + 18);
    expect(computeNmbScore("DEF", stats, { isWinningGoalScorer: false })).toBe(base + 12);
  });

  it("clean sheet only credits GK/DEF at 60+ minutes", () => {
    const cs = { ...emptyStats(), minutes: 90, cleanSheet: true };
    expect(computeNmbScore("DEF", cs, { isWinningGoalScorer: false })).toBe(6 + 12);
    expect(computeNmbScore("MID", cs, { isWinningGoalScorer: false })).toBe(6);
    const early = { ...emptyStats(), minutes: 45, cleanSheet: true };
    expect(computeNmbScore("DEF", early, { isWinningGoalScorer: false })).toBe(3);
  });

  it("winning-goal scorer gets +3", () => {
    const stats = { ...emptyStats(), minutes: 90, goals: 1 };
    const withWg = computeNmbScore("FWD", stats, { isWinningGoalScorer: true });
    const without = computeNmbScore("FWD", stats, { isWinningGoalScorer: false });
    expect(withWg - without).toBe(3);
  });
});

describe("winning goal ordinal", () => {
  it("draw ⇒ no winning goal", () => {
    expect(winningGoalScorerId(1, 2, 2, 2, [10, 11], [20, 21])).toBeNull();
  });

  it("home win: (awayScore + 1)th home goal", () => {
    // 3-1: the 2nd home goal is the winner.
    expect(winningGoalScorerId(1, 2, 3, 1, [10, 11, 12], [20])).toBe(11);
  });

  it("away win: (homeScore + 1)th away goal", () => {
    expect(winningGoalScorerId(1, 2, 0, 2, [], [20, 21])).toBe(20);
  });

  it("own goal at the ordinal ⇒ nobody gets the +3", () => {
    expect(winningGoalScorerId(1, 2, 3, 1, [10, null, 12], [20])).toBeNull();
  });
});

describe("goalScorerOrdersFromEvents", () => {
  const ev = (
    minute: number,
    teamId: number,
    playerId: number | null,
    detail: string,
    comments: string | null = null,
  ) => ({
    minute,
    extraMinute: null,
    teamId,
    playerId,
    assistPlayerId: null,
    type: "Goal",
    detail,
    comments,
  });

  it("keeps own goals in the benefiting team's tally with scorer null", () => {
    const orders = goalScorerOrdersFromEvents(
      [
        ev(10, 1, 501, "Normal Goal"),
        ev(30, 1, 601, "Own Goal"), // away defender, credited to home
        ev(60, 1, 502, "Penalty"),
        ev(75, 2, 701, "Normal Goal"),
      ],
      1,
      2,
    );
    expect(orders.home).toEqual([501, null, 502]);
    expect(orders.away).toEqual([701]);
  });

  it("sorts by minute + stoppage and drops shootout + missed penalties", () => {
    const late = { ...ev(90, 1, 502, "Normal Goal"), extraMinute: 4 };
    const orders = goalScorerOrdersFromEvents(
      [
        late,
        ev(90, 1, 501, "Normal Goal"),
        ev(88, 1, 503, "Missed Penalty"),
        ev(120, 1, 504, "Penalty", "Penalty Shootout"),
      ],
      1,
      2,
    );
    expect(orders.home).toEqual([501, 502]);
  });
});
