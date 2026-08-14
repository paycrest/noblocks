/**
 * FPL auto-substitution rules — the module flagged as highest bug risk.
 * Covers: evolving XI, formation-floor skip case, GK like-for-like, bench
 * priority, and the armband NEVER transferring to an incoming substitute.
 */
import { applyAutoSubs } from "@/app/lib/fantasy/autosubs";
import { computeSquadPoints, type SquadPlayerRow } from "@/app/lib/fantasy/scoring";

const row = (
  playerId: number,
  slot: number,
  position: SquadPlayerRow["position"],
  flags: Partial<Pick<SquadPlayerRow, "isCaptain" | "isVice">> = {},
): SquadPlayerRow => ({
  playerId,
  slot,
  position,
  isCaptain: flags.isCaptain ?? false,
  isVice: flags.isVice ?? false,
});

/** 4-4-2 XI; bench 12=MID, 13=DEF, 14=FWD, 15=GK. */
function squad(overrides: Partial<SquadPlayerRow>[] = []): SquadPlayerRow[] {
  const base: SquadPlayerRow[] = [
    row(1, 1, "GK"),
    row(2, 2, "DEF"),
    row(3, 3, "DEF"),
    row(4, 4, "DEF"),
    row(5, 5, "DEF"),
    row(6, 6, "MID"),
    row(7, 7, "MID"),
    row(8, 8, "MID"),
    row(9, 9, "MID"),
    row(10, 10, "FWD"),
    row(11, 11, "FWD"),
    row(12, 12, "MID"),
    row(13, 13, "DEF"),
    row(14, 14, "FWD"),
    row(15, 15, "GK"),
  ];
  for (const o of overrides) {
    const i = base.findIndex((b) => b.playerId === o.playerId);
    if (i >= 0) base[i] = { ...base[i], ...o };
  }
  return base;
}

const playedFrom = (ids: number[]) => {
  const set = new Set(ids);
  return (id: number) => set.has(id);
};

const ALL_XI = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

describe("goalkeeper substitution", () => {
  it("blanked GK is replaced only by the bench GK", () => {
    const xi = applyAutoSubs(squad(), playedFrom([...ALL_XI.filter((id) => id !== 1), 12, 13, 14, 15]));
    const ids = xi.map((p) => p.playerId);
    expect(ids).not.toContain(1);
    expect(ids).toContain(15);
    expect(xi.find((p) => p.playerId === 15)?.slot).toBe(1);
  });

  it("blanked GK stays if the bench GK also blanked — outfielders never sub a GK", () => {
    const xi = applyAutoSubs(squad(), playedFrom([...ALL_XI.filter((id) => id !== 1), 12, 13, 14]));
    const ids = xi.map((p) => p.playerId);
    expect(ids).toContain(1);
    expect(ids).not.toContain(15);
    expect(xi.filter((p) => p.position === "GK")).toHaveLength(1);
  });
});

describe("bench priority and formation floors", () => {
  it("bench order 12 → 13 → 14 is respected when all are legal", () => {
    // One blank MID; bench 12 (MID) has priority over 13/14.
    const xi = applyAutoSubs(squad(), playedFrom([...ALL_XI.filter((id) => id !== 6), 12, 13, 14, 15]));
    const ids = xi.map((p) => p.playerId);
    expect(ids).toContain(12);
    expect(ids).not.toContain(6);
    expect(ids).not.toContain(13);
    expect(ids).not.toContain(14);
  });

  it("skips a higher-priority bench player whose entry would break the formation floor", () => {
    // 3-5-2 XI: exactly 3 DEF. A blank DEF cannot be replaced by bench MID #12
    // (would leave 2 DEF < floor 3); bench DEF #13 must come in instead.
    const s: SquadPlayerRow[] = [
      row(1, 1, "GK"),
      row(2, 2, "DEF"),
      row(3, 3, "DEF"),
      row(4, 4, "DEF"),
      row(5, 5, "MID"),
      row(6, 6, "MID"),
      row(7, 7, "MID"),
      row(8, 8, "MID"),
      row(9, 9, "MID"),
      row(10, 10, "FWD"),
      row(11, 11, "FWD"),
      row(12, 12, "MID"),
      row(13, 13, "DEF"),
      row(14, 14, "FWD"),
      row(15, 15, "GK"),
    ];
    const xi = applyAutoSubs(
      s,
      playedFrom([1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]), // DEF #4 blank
    );
    const ids = xi.map((p) => p.playerId);
    expect(ids).not.toContain(4);
    expect(ids).toContain(13); // DEF replaces DEF to hold the floor
    expect(ids).not.toContain(12); // higher-priority MID was skipped
  });

  it("last FWD cannot be replaced by a MID (≥1 FWD floor)", () => {
    // 4-5-1: single FWD blanks; bench has MID #12 (played) and DEF #13 (played)
    // but no FWD who played — no legal sub, the blank FWD stays.
    const s: SquadPlayerRow[] = [
      row(1, 1, "GK"),
      row(2, 2, "DEF"),
      row(3, 3, "DEF"),
      row(4, 4, "DEF"),
      row(5, 5, "DEF"),
      row(6, 6, "MID"),
      row(7, 7, "MID"),
      row(8, 8, "MID"),
      row(9, 9, "MID"),
      row(10, 10, "MID"),
      row(11, 11, "FWD"),
      row(12, 12, "MID"),
      row(13, 13, "DEF"),
      row(14, 14, "FWD"),
      row(15, 15, "GK"),
    ];
    const xi = applyAutoSubs(s, playedFrom([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13]));
    const ids = xi.map((p) => p.playerId);
    expect(ids).toContain(11); // stranded blank FWD stays in the XI
    expect(ids).not.toContain(12);
    expect(ids).not.toContain(13);
  });

  it("evolving XI: two blanks fill from the bench without reusing a player", () => {
    const xi = applyAutoSubs(
      squad(),
      playedFrom([1, 2, 3, 4, 6, 7, 8, 9, 10, 12, 13, 14]), // DEF #5 and FWD #11 blank
    );
    const ids = xi.map((p) => p.playerId);
    expect(xi).toHaveLength(11);
    expect(new Set(ids).size).toBe(11);
    expect(ids).toEqual(expect.arrayContaining([12, 13]));
    expect(ids).not.toContain(5);
    expect(ids).not.toContain(11);
  });

  it("bench players who did not play never come on", () => {
    const xi = applyAutoSubs(
      squad(),
      playedFrom([1, 2, 3, 4, 6, 7, 8, 9, 10, 11]), // DEF #5 blank; whole bench blank
    );
    expect(xi.map((p) => p.playerId)).toContain(5);
  });
});

describe("armband never transfers to a substitute", () => {
  it("incoming substitutes carry no captain or vice flag", () => {
    const s = squad([
      { playerId: 6, isCaptain: true },
      { playerId: 7, isVice: true },
    ]);
    const xi = applyAutoSubs(s, playedFrom([1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12])); // captain #6 blank
    const sub = xi.find((p) => p.playerId === 12)!;
    expect(sub.isCaptain).toBe(false);
    expect(sub.isVice).toBe(false);
  });

  it("captain blank ⇒ vice doubles (not the sub)", () => {
    const s = squad([
      { playerId: 6, isCaptain: true },
      { playerId: 7, isVice: true },
    ]);
    const pts = new Map(
      [
        [1, 2], [2, 2], [3, 2], [4, 2], [5, 2],
        [6, 0], [7, 5], [8, 2], [9, 2], [10, 2], [11, 2],
        [12, 10],
      ].map(([id, points]) => [
        id,
        { points, minutes: id === 6 ? 0 : 90, yellowCards: 0, redCards: 0 },
      ]),
    );
    const { points } = computeSquadPoints(
      { squad: s, playerPoints: pts, transferPointsDeduction: 0 },
      applyAutoSubs,
    );
    // XI sums to 33 after the sub; vice's 5 doubles ⇒ 38 (sub's 10 does NOT).
    expect(points).toBe(38);
  });

  it("captain plays ⇒ captain doubles, vice does not", () => {
    const s = squad([
      { playerId: 6, isCaptain: true },
      { playerId: 7, isVice: true },
    ]);
    const pts = new Map(
      [
        [1, 2], [2, 2], [3, 2], [4, 2], [5, 2],
        [6, 8], [7, 5], [8, 2], [9, 2], [10, 2], [11, 2],
      ].map(([id, points]) => [id, { points, minutes: 90, yellowCards: 0, redCards: 0 }]),
    );
    const { points } = computeSquadPoints(
      { squad: s, playerPoints: pts, transferPointsDeduction: 0 },
      applyAutoSubs,
    );
    expect(points).toBe(31 + 8); // XI 31 + captain double 8
  });

  it("captain AND vice both blank ⇒ nobody doubles", () => {
    const s = squad([
      { playerId: 6, isCaptain: true },
      { playerId: 7, isVice: true },
    ]);
    const pts = new Map(
      [
        [1, 2], [2, 2], [3, 2], [4, 2], [5, 2],
        [6, 0], [7, 0], [8, 2], [9, 2], [10, 2], [11, 2],
        [12, 9], [13, 4],
      ].map(([id, points]) => [
        id,
        { points, minutes: points === 0 ? 0 : 90, yellowCards: 0, redCards: 0 },
      ]),
    );
    const { points } = computeSquadPoints(
      { squad: s, playerPoints: pts, transferPointsDeduction: 0 },
      applyAutoSubs,
    );
    expect(points).toBe(31);
  });

  it("0' with a card counts as played — carded captain keeps the double", () => {
    const s = squad([{ playerId: 6, isCaptain: true }, { playerId: 7, isVice: true }]);
    const pts = new Map(
      [1, 2, 3, 4, 5, 7, 8, 9, 10, 11].map((id) => [
        id,
        { points: 2, minutes: 90, yellowCards: 0, redCards: 0 },
      ]),
    );
    // Captain: red card off the bench warm-up — 0 minutes, -3 points, but "played".
    pts.set(6, { points: -3, minutes: 0, yellowCards: 0, redCards: 1 });
    const { points, scoringXi } = computeSquadPoints(
      { squad: s, playerPoints: pts, transferPointsDeduction: 0 },
      applyAutoSubs,
    );
    expect(scoringXi.map((p) => p.playerId)).toContain(6); // not auto-subbed
    expect(points).toBe(20 - 3 - 3); // captain's -3 doubled
  });
});
