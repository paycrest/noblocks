import {
  adjustTotalPointsForLiveRound,
  computeDisplayedMatchdayPoints,
} from "@/app/lib/fantasy/scoring";
import { applyAutoSubs } from "@/app/lib/fantasy/autosubs";
import type { SquadPlayerRow } from "@/app/lib/fantasy/scoring";

const squad: SquadPlayerRow[] = [
  { playerId: 1, slot: 1, isCaptain: true, isVice: false, position: "GK" },
  { playerId: 2, slot: 2, isCaptain: false, isVice: true, position: "DEF" },
  { playerId: 3, slot: 3, isCaptain: false, isVice: false, position: "DEF" },
  { playerId: 4, slot: 4, isCaptain: false, isVice: false, position: "DEF" },
  { playerId: 5, slot: 5, isCaptain: false, isVice: false, position: "MID" },
  { playerId: 6, slot: 6, isCaptain: false, isVice: false, position: "MID" },
  { playerId: 7, slot: 7, isCaptain: false, isVice: false, position: "MID" },
  { playerId: 8, slot: 8, isCaptain: false, isVice: false, position: "MID" },
  { playerId: 9, slot: 9, isCaptain: false, isVice: false, position: "FWD" },
  { playerId: 10, slot: 10, isCaptain: false, isVice: false, position: "FWD" },
  { playerId: 11, slot: 11, isCaptain: false, isVice: false, position: "FWD" },
  { playerId: 12, slot: 12, isCaptain: false, isVice: false, position: "GK" },
  { playerId: 13, slot: 13, isCaptain: false, isVice: false, position: "DEF" },
  { playerId: 14, slot: 14, isCaptain: false, isVice: false, position: "MID" },
  { playerId: 15, slot: 15, isCaptain: false, isVice: false, position: "FWD" },
];

const playerPoints = new Map(
  squad.map((player) => [
    player.playerId,
    {
      points: player.playerId === 9 ? 0 : player.slot <= 11 ? 2 : 9,
      minutes: player.playerId === 9 ? 0 : 90,
      yellowCards: 0,
      redCards: 0,
    },
  ]),
);

describe("computeDisplayedMatchdayPoints", () => {
  it("ignores auto-subs while the gameweek is live", () => {
    const livePoints = computeDisplayedMatchdayPoints(
      {
        squadRows: squad,
        playerPoints,
        transferPointsDeduction: 0,
        matchdayStatus: "live",
      },
      applyAutoSubs,
    );
    const finalPoints = computeDisplayedMatchdayPoints(
      {
        squadRows: squad,
        playerPoints,
        transferPointsDeduction: 0,
        matchdayStatus: "final",
      },
      applyAutoSubs,
    );

    expect(livePoints).toBe(10 * 2 + 2); // blank captain stays, no bench sub
    expect(finalPoints).toBeGreaterThan(livePoints);
    expect(applyAutoSubs(squad, (id) => id !== 9).map((p) => p.playerId)).toContain(13);
  });
});

describe("adjustTotalPointsForLiveRound", () => {
  it("replaces the stored live GW row with the gated score", () => {
    const adjusted = adjustTotalPointsForLiveRound(
      120,
      [
        { matchday_id: 101, points: 40 },
        { matchday_id: 102, points: 80 },
      ],
      102,
      "live",
      22,
    );

    expect(adjusted).toBe(62);
  });

  it("leaves the stored total alone once the gameweek is final", () => {
    expect(
      adjustTotalPointsForLiveRound(
        120,
        [{ matchday_id: 102, points: 80 }],
        102,
        "final",
        22,
      ),
    ).toBe(120);
  });
});
