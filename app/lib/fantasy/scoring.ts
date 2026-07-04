import type {
  PlayerMatchStats,
  PointsBreakdownEntry,
  Position,
  ScoringMatrix,
} from "./types";

/**
 * Pure fantasy points engine (TRD §6.9).
 *
 * Runs idempotently on every stats upsert: points are always recomputed from
 * the raw stats, never incremented, so provider stat corrections self-heal.
 * Captain doubling and vice fallback are aggregation concerns handled in
 * computeSquadPoints, not here.
 */
export function computePoints(
  stats: PlayerMatchStats,
  position: Position,
  matrix: ScoringMatrix,
): { points: number; breakdown: PointsBreakdownEntry[] } {
  const breakdown: PointsBreakdownEntry[] = [];
  const add = (reason: string, points: number) => {
    if (points !== 0) breakdown.push({ reason, points });
  };

  if (stats.minutes <= 0) {
    return { points: 0, breakdown };
  }

  add("Appearance", matrix.appearance);
  if (stats.minutes >= 60) add("60+ minutes", matrix.appearance_60);

  if (stats.goals > 0) add(`Goals (${stats.goals})`, stats.goals * matrix.goal[position]);
  if (stats.directFreeKickGoals > 0)
    add(
      `Direct free-kick bonus (${stats.directFreeKickGoals})`,
      stats.directFreeKickGoals * matrix.direct_free_kick_goal,
    );
  if (stats.assists > 0) add(`Assists (${stats.assists})`, stats.assists * matrix.assist);

  if (stats.cleanSheet && stats.minutes >= 60) {
    add("Clean sheet", matrix.clean_sheet[position]);
  }

  // First goal conceded is free; each additional one costs (GK/DEF only).
  const perExtra = matrix.goals_conceded_per_extra[position];
  if (perExtra !== 0 && stats.goalsConceded > 1) {
    add(`Goals conceded (${stats.goalsConceded})`, (stats.goalsConceded - 1) * perExtra);
  }

  if (position === "GK") {
    if (stats.penaltiesSaved > 0)
      add(`Penalty saves (${stats.penaltiesSaved})`, stats.penaltiesSaved * matrix.penalty_save);
    const savePts = Math.floor(stats.saves / matrix.saves_per_point);
    if (savePts > 0) add(`Saves (${stats.saves})`, savePts);
  }

  if (position === "MID") {
    const tacklePts = Math.floor(stats.tackles / matrix.tackles_per_point);
    if (tacklePts > 0) add(`Tackles (${stats.tackles})`, tacklePts);
    const kpPts = Math.floor(stats.keyPasses / matrix.key_passes_per_point);
    if (kpPts > 0) add(`Key passes (${stats.keyPasses})`, kpPts);
  }

  if (position === "FWD") {
    const sotPts = Math.floor(stats.shotsOnTarget / matrix.shots_on_target_per_point);
    if (sotPts > 0) add(`Shots on target (${stats.shotsOnTarget})`, sotPts);
  }

  if (stats.yellowCards > 0)
    add(`Yellow cards (${stats.yellowCards})`, stats.yellowCards * matrix.yellow_card);
  if (stats.redCards > 0) add("Red card", stats.redCards * matrix.red_card);
  if (stats.ownGoals > 0) add(`Own goals (${stats.ownGoals})`, stats.ownGoals * matrix.own_goal);
  if (stats.penaltiesWon > 0)
    add(`Penalties won (${stats.penaltiesWon})`, stats.penaltiesWon * matrix.penalty_won);
  if (stats.penaltiesCommitted > 0)
    add(
      `Penalties conceded (${stats.penaltiesCommitted})`,
      stats.penaltiesCommitted * matrix.penalty_conceded,
    );

  const points = breakdown.reduce((sum, e) => sum + e.points, 0);
  return { points, breakdown };
}

export interface SquadPointsInput {
  /** Starting XI only — bench never auto-counts (auto-subs dropped, TRD §6.3). */
  startingXI: { playerId: number; isCaptain: boolean; isVice: boolean }[];
  /** playerId → summed matchday stats-derived values. */
  playerPoints: Map<number, { points: number; minutes: number }>;
  transferPointsDeduction: number;
}

/**
 * Matchday total for one squad. Captain scores double; if the captain played
 * zero minutes, the vice-captain scores double instead — unconditionally
 * (simplification per TRD §6.3, strictly more generous than the official rule).
 */
export function computeSquadPoints(input: SquadPointsInput): number {
  const { startingXI, playerPoints, transferPointsDeduction } = input;

  const get = (id: number) => playerPoints.get(id) ?? { points: 0, minutes: 0 };

  let total = 0;
  for (const entry of startingXI) total += get(entry.playerId).points;

  const captain = startingXI.find((p) => p.isCaptain);
  const vice = startingXI.find((p) => p.isVice);

  if (captain && get(captain.playerId).minutes > 0) {
    total += get(captain.playerId).points;
  } else if (vice && get(vice.playerId).minutes > 0) {
    total += get(vice.playerId).points;
  }

  return total - transferPointsDeduction;
}

/** Empty stats record (safe default when the provider has no data yet). */
export function emptyStats(): PlayerMatchStats {
  return {
    minutes: 0,
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    ownGoals: 0,
    penaltiesWon: 0,
    penaltiesCommitted: 0,
    penaltiesSaved: 0,
    saves: 0,
    goalsConceded: 0,
    tackles: 0,
    keyPasses: 0,
    shotsOnTarget: 0,
    cleanSheet: false,
    directFreeKickGoals: 0,
  };
}
