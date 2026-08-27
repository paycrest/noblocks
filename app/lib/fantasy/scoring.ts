import type {
  FantasySettings,
  MatchdayStatus,
  PlayerMatchStats,
  PointsBreakdownEntry,
  Position,
  ScoringMatrix,
  SubState,
} from "./types";

/**
 * Pure FPL-aligned fantasy points. Idempotent: always recomputed from raw stats.
 * Captain / auto-subs / Noblocks Match Bonus are separate aggregation stages.
 */
export function computePoints(
  stats: PlayerMatchStats,
  position: Position,
  matrix: ScoringMatrix,
  settings: Pick<FantasySettings, "defcon_def_threshold" | "defcon_mid_fwd_threshold">,
): { points: number; breakdown: PointsBreakdownEntry[] } {
  const breakdown: PointsBreakdownEntry[] = [];
  const add = (reason: string, points: number) => {
    if (points !== 0) breakdown.push({ reason, points });
  };

  /** Cards and penalty misses — shared by the 0-minute and main paths. Own goals
   *  are main-path-only: you cannot score an OG without playing. */
  const addCardAndDisciplineDeductions = (includeOwnGoals: boolean) => {
    if (stats.yellowCards > 0)
      add(`Yellow cards (${stats.yellowCards})`, stats.yellowCards * matrix.yellow_card);
    if (stats.redCards > 0) add("Red card", stats.redCards * matrix.red_card);
    if (includeOwnGoals && stats.ownGoals > 0)
      add(`Own goals (${stats.ownGoals})`, stats.ownGoals * matrix.own_goal);
    if (stats.penaltiesMissed > 0)
      add(
        `Penalty miss (${stats.penaltiesMissed})`,
        stats.penaltiesMissed * matrix.penalty_miss,
      );
  };

  if (stats.minutes <= 0) {
    // Carded with 0' still "played" for auto-subs; no appearance points here.
    addCardAndDisciplineDeductions(false);
    const points = breakdown.reduce((sum, e) => sum + e.points, 0);
    return { points, breakdown };
  }

  add("Appearance", matrix.appearance);
  if (stats.minutes >= 60) add("60+ minutes", matrix.appearance_60);

  const openPlayGoals = Math.max(0, stats.goals - stats.penaltiesScored);
  if (openPlayGoals > 0)
    add(`Goals (${openPlayGoals})`, openPlayGoals * matrix.goal[position]);
  // Penalty goals use the same per-position goal points in FPL.
  if (stats.penaltiesScored > 0)
    add(
      `Penalty goals (${stats.penaltiesScored})`,
      stats.penaltiesScored * matrix.goal[position],
    );

  if (stats.assists > 0) add(`Assists (${stats.assists})`, stats.assists * matrix.assist);

  if (stats.cleanSheet && stats.minutes >= 60) {
    add("Clean sheet", matrix.clean_sheet[position]);
  }

  const perTwo = matrix.goals_conceded_per_two[position];
  if (perTwo !== 0 && stats.goalsConceded >= 2) {
    const n = Math.floor(stats.goalsConceded / 2);
    add(`Goals conceded (${stats.goalsConceded})`, n * perTwo);
  }

  if (position === "GK") {
    if (stats.penaltiesSaved > 0)
      add(`Penalty saves (${stats.penaltiesSaved})`, stats.penaltiesSaved * matrix.penalty_save);
    const savePts = Math.floor(stats.saves / matrix.saves_per_point);
    if (savePts > 0) add(`Saves (${stats.saves})`, savePts);
  }

  // BIT defcon (published thresholds from provider spike).
  if (position === "DEF") {
    const bit = stats.blocks + stats.interceptions + stats.tackles;
    if (bit >= settings.defcon_def_threshold) add("Defensive contribution", 2);
  } else if (position === "MID" || position === "FWD") {
    const bit = stats.blocks + stats.interceptions + stats.tackles;
    if (bit >= settings.defcon_mid_fwd_threshold) add("Defensive contribution", 2);
  }

  addCardAndDisciplineDeductions(true);

  const points = breakdown.reduce((sum, e) => sum + e.points, 0);
  return { points, breakdown };
}

/**
 * Badge state for a picked slot, given whether the player ended up in the
 * post-auto-sub XI. The original slot identifies which side of the final
 * substitution the player came from, even when the UI renders a display swap.
 */
export function subStateFor(slot: number, inScoringXi: boolean): SubState {
  if (inScoringXi) return slot > 11 ? "in" : null;
  return slot <= 11 ? "out" : null;
}

/** Appearance or yellow/red ⇒ played (FPL auto-sub definition). */
export function hasPlayed(stats: { minutes: number; yellowCards: number; redCards: number }): boolean {
  return stats.minutes > 0 || stats.yellowCards > 0 || stats.redCards > 0;
}

export interface SquadPlayerRow {
  playerId: number;
  slot: number;
  isCaptain: boolean;
  isVice: boolean;
  position: Position;
}

export interface SquadPointsInput {
  /** Full 15 with slots. */
  squad: SquadPlayerRow[];
  playerPoints: Map<number, { points: number; minutes: number; yellowCards: number; redCards: number }>;
  transferPointsDeduction: number;
  /**
   * False while a gameweek is in progress: score the picked XI and do not
   * transfer captaincy to the vice-captain. True/default once the gameweek is
   * final, when FPL auto-subs and captain fallback settle.
   */
  settleLineup?: boolean;
}

/**
 * Matchday total. Before final, score the picked XI and do not transfer
 * captaincy. Once final, apply auto-subs and captain → vice fallback.
 */
export function computeSquadPoints(
  input: SquadPointsInput,
  applyAutoSubs: (squad: SquadPlayerRow[], played: (id: number) => boolean) => SquadPlayerRow[],
): { points: number; scoringXi: SquadPlayerRow[] } {
  const { squad, playerPoints, transferPointsDeduction, settleLineup = true } = input;
  const played = (id: number) => {
    const p = playerPoints.get(id);
    if (!p) return false;
    return hasPlayed(p);
  };

  const scoringXi = settleLineup
    ? applyAutoSubs(squad, played)
    : squad.filter((player) => player.slot <= 11);
  const get = (id: number) => playerPoints.get(id) ?? { points: 0, minutes: 0, yellowCards: 0, redCards: 0 };

  let total = 0;
  for (const entry of scoringXi) total += get(entry.playerId).points;

  // Armband lives on the ORIGINAL starting rows — a blanked captain may have
  // been auto-subbed out of scoringXi, and the incoming sub never inherits it.
  const startingXi = squad.filter((p) => p.slot <= 11);
  const captain = startingXi.find((p) => p.isCaptain);
  const vice = startingXi.find((p) => p.isVice);

  if (captain && played(captain.playerId)) {
    total += get(captain.playerId).points;
  } else if (settleLineup && vice && played(vice.playerId)) {
    total += get(vice.playerId).points;
  }

  return { points: total - transferPointsDeduction, scoringXi };
}

/** Round total for display — picked XI only until the gameweek is final. */
export function computeDisplayedMatchdayPoints(
  input: {
    squadRows: SquadPlayerRow[];
    playerPoints: Map<
      number,
      { points: number; minutes: number; yellowCards: number; redCards: number }
    >;
    transferPointsDeduction: number;
    matchdayStatus: MatchdayStatus;
  },
  applyAutoSubsFn: (squad: SquadPlayerRow[], played: (id: number) => boolean) => SquadPlayerRow[],
): number {
  const settleLineup = input.matchdayStatus === "final";
  return computeSquadPoints(
    {
      squad: input.squadRows,
      playerPoints: input.playerPoints,
      transferPointsDeduction: input.transferPointsDeduction,
      settleLineup,
    },
    applyAutoSubsFn,
  ).points;
}

/** DB season totals include the worker's live GW row — swap in the gated score mid-week. */
export function adjustTotalPointsForLiveRound(
  storedTotal: number,
  matchdayScores: { matchday_id: number; points: number }[],
  matchdayId: number,
  matchdayStatus: MatchdayStatus,
  computedRoundPoints: number,
): number {
  if (matchdayStatus === "final") return storedTotal;
  const dbRound =
    matchdayScores.find((score) => score.matchday_id === matchdayId)?.points ?? 0;
  return storedTotal - dbRound + computedRoundPoints;
}

export function computeTransferCost(
  transferCount: number,
  freeRemaining: number,
  penalty: number,
): { freeUsed: number; paidCount: number; pointsCost: number } {
  const freeUsed = Math.min(transferCount, Math.max(0, freeRemaining));
  const paidCount = transferCount - freeUsed;
  return { freeUsed, paidCount, pointsCost: paidCount * penalty };
}

export function emptyStats(): PlayerMatchStats {
  return {
    minutes: 0,
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    ownGoals: 0,
    penaltiesMissed: 0,
    penaltiesScored: 0,
    penaltiesCommitted: 0,
    penaltiesSaved: 0,
    saves: 0,
    goalsConceded: 0,
    tackles: 0,
    blocks: 0,
    interceptions: 0,
    keyPasses: 0,
    shotsTotal: 0,
    shotsOnTarget: 0,
    passesTotal: 0,
    passesAccuracy: 0,
    dribblesSuccess: 0,
    foulsDrawn: 0,
    foulsCommitted: 0,
    offsides: 0,
    cleanSheet: false,
  };
}
