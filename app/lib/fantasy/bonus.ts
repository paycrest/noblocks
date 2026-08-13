import type { PlayerMatchStats, PointsBreakdownEntry, Position } from "./types";

export interface NmbPlayerInput {
  playerId: number;
  position: Position;
  stats: PlayerMatchStats;
  /** Team id for winning-goal attribution. */
  teamId: number;
}

/**
 * Noblocks Match Bonus (NMB) — published proxy, not Opta BPS.
 * Compute in memory over a fixture, then award 3/2/1 with FPL tie rules.
 */
export function computeNmbScore(
  position: Position,
  stats: PlayerMatchStats,
  opts: { isWinningGoalScorer: boolean },
): number {
  let nmb = 0;
  if (stats.minutes <= 0) {
    // Still apply card / miss / OG deductions if present
  } else if (stats.minutes < 60) {
    nmb += 3;
  } else {
    nmb += 6;
  }

  const penGoals = stats.penaltiesScored;
  const openPlay = Math.max(0, stats.goals - penGoals);
  if (penGoals > 0) nmb += penGoals * 12;
  if (openPlay > 0) {
    const g = position === "FWD" ? 24 : position === "MID" ? 18 : 12;
    nmb += openPlay * g;
  }

  nmb += stats.assists * 9;
  if (stats.cleanSheet && stats.minutes >= 60 && (position === "GK" || position === "DEF")) {
    nmb += 12;
  }
  nmb += stats.saves * 2;
  nmb += stats.penaltiesSaved * 7;
  nmb += stats.penaltiesMissed * -6;
  nmb += stats.penaltiesCommitted * -3;
  nmb += stats.keyPasses; // creating a chance
  nmb += Math.floor((stats.blocks + stats.interceptions) / 3);
  nmb += stats.tackles * 2;
  nmb += stats.dribblesSuccess;
  nmb += stats.shotsOnTarget * 2;
  const shotOff = Math.max(0, stats.shotsTotal - stats.shotsOnTarget);
  nmb += shotOff * -1;

  if (stats.passesTotal >= 30) {
    const acc = stats.passesAccuracy; // 0–100
    if (acc >= 90) nmb += 6;
    else if (acc >= 80) nmb += 4;
    else if (acc >= 70) nmb += 2;
  }

  nmb += stats.foulsDrawn;
  nmb += stats.foulsCommitted * -1;
  nmb += stats.offsides * -1;
  nmb += stats.yellowCards * -3;
  nmb += stats.redCards * -9;
  nmb += stats.ownGoals * -6;
  if (position === "GK" || position === "DEF") {
    nmb += stats.goalsConceded * -4;
  }
  if (opts.isWinningGoalScorer) nmb += 3;

  return nmb;
}

/**
 * Winning goal = winner’s (loserFinal + 1)th goal. Draws: none.
 * Order arrays are chronological goal events for each team INCLUDING own
 * goals (scorer null, attributed to the benefiting side) so the ordinal
 * indexes the same tally the score counts. A null at the ordinal means the
 * winning goal was an own goal — nobody gets the +3.
 */
export function winningGoalScorerId(
  homeTeamId: number,
  awayTeamId: number,
  homeScore: number,
  awayScore: number,
  homeGoalScorerIdsInOrder: (number | null)[],
  awayGoalScorerIdsInOrder: (number | null)[],
): number | null {
  if (homeScore === awayScore) return null;
  if (homeScore > awayScore) {
    const ordinal = awayScore + 1; // 1-based
    return homeGoalScorerIdsInOrder[ordinal - 1] ?? null;
  }
  const ordinal = homeScore + 1;
  return awayGoalScorerIdsInOrder[ordinal - 1] ?? null;
}

/**
 * FPL bonus tie rules → map playerId → bonus points (1–3).
 * Only players who actually appeared (minutes > 0) are eligible — an unused
 * substitute sits at NMB 0 and must never out-rank a negative on-pitch score.
 *
 * Place-based award: tied players share a place, the next distinct score
 * lands at place (index + 1), and place p pays 4 − p while p ≤ 3. This
 * reproduces every official example — tie for 1st → 3/3/1, tie for 2nd →
 * 3/2/2, tie for 3rd → 3/2/1/1 — and a three-way tie for 1st fills the
 * podium (3/3/3, nobody else paid).
 */
export function awardBonusPoints(
  ranked: { playerId: number; nmb: number; minutes: number }[],
): Map<number, number> {
  const sorted = ranked
    .filter((p) => p.minutes > 0)
    .sort((a, b) => b.nmb - a.nmb);
  const out = new Map<number, number>();
  let place = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i].nmb < sorted[i - 1].nmb) place = i + 1;
    if (place > 3) break;
    out.set(sorted[i].playerId, 4 - place);
  }
  return out;
}

/** Merge bonus into an existing breakdown + points (single upsert payload). */
export function applyBonusToResult(
  basePoints: number,
  breakdown: PointsBreakdownEntry[],
  bonus: number,
): { points: number; breakdown: PointsBreakdownEntry[] } {
  if (bonus === 0) return { points: basePoints, breakdown };
  return {
    points: basePoints + bonus,
    breakdown: [...breakdown, { reason: "Noblocks Match Bonus", points: bonus }],
  };
}
