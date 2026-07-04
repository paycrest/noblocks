/**
 * Noblocks Play — shared domain types for the World Cup fantasy league.
 * Isomorphic (no server-only imports): used by the engine, API routes,
 * client components and tests.
 */

export type Position = "GK" | "DEF" | "MID" | "FWD";

export type MatchdayStatus = "upcoming" | "live" | "finalizing" | "final";

export type BadgeState = "qualified" | "in_progress" | "opted_out";

/** Normalized per-player per-fixture stats the scoring engine consumes. */
export interface PlayerMatchStats {
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  penaltiesWon: number;
  penaltiesCommitted: number;
  penaltiesSaved: number;
  saves: number;
  /** Goals conceded by the player's team while they were on the pitch. */
  goalsConceded: number;
  tackles: number;
  /** Key passes stand in for "big chances created" at the same 2-for-1 rate (TRD §6.8). */
  keyPasses: number;
  shotsOnTarget: number;
  /** 60+ min played and team conceded 0 while on pitch (derived upstream). */
  cleanSheet: boolean;
  /** Best-effort: only counted when provider events identify the goal type (TRD §6.8). */
  directFreeKickGoals: number;
}

export interface ScoringMatrix {
  appearance: number;
  appearance_60: number;
  assist: number;
  yellow_card: number;
  red_card: number;
  own_goal: number;
  penalty_won: number;
  penalty_conceded: number;
  goal: Record<Position, number>;
  clean_sheet: Record<Position, number>;
  goals_conceded_per_extra: Record<Position, number>;
  penalty_save: number;
  saves_per_point: number;
  tackles_per_point: number;
  key_passes_per_point: number;
  shots_on_target_per_point: number;
  direct_free_kick_goal: number;
}

export interface PointsBreakdownEntry {
  reason: string;
  points: number;
}

export interface FantasySettings {
  budget: number;
  squad_size: number;
  positions: Record<Position, number>;
  formations: string[];
  /** Max players from one nation, keyed by matchday label (MD6/MD7/MD8). */
  nation_caps: Record<string, number>;
  /** Free transfers granted before each matchday, keyed by label. */
  free_transfers: Record<string, number>;
  transfer_penalty: number;
  scoring: ScoringMatrix;
  qualification_deadline: string;
  referrals_required: number;
  referral_min_total_usd: number;
  cngn_usd_rate: number;
  campaign_end: string;
  features: { emails: boolean; share_cards: boolean; join_open: boolean };
}

export interface FantasyPlayer {
  provider_player_id: number;
  team_id: number;
  name: string;
  nation: string;
  position: Position;
  price: number;
  photo_url: string | null;
  is_active: boolean;
}

export interface SquadSelection {
  /** slot (1–11 XI, 12–15 bench) → player id */
  players: { playerId: number; slot: number }[];
  captainId: number;
  viceId: number;
}

export interface LeaderboardRow {
  rank: number;
  username: string | null;
  total_points: number;
  badge: BadgeState;
  movement: number; // previous_rank - rank; positive = climbed
  is_me?: boolean;
}
