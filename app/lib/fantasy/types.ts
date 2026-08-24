/**
 * Noblocks Play — shared domain types (EPL season).
 */

export type Position = "GK" | "DEF" | "MID" | "FWD";

export type MatchdayStatus = "upcoming" | "live" | "finalizing" | "final";

export type BadgeState = "active" | "opted_out";

/** Normalized per-player per-fixture stats the scoring engine consumes. */
export interface PlayerMatchStats {
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  penaltiesMissed: number;
  penaltiesScored: number;
  penaltiesCommitted: number;
  penaltiesSaved: number;
  saves: number;
  /** Goals conceded by the player's team while they were on the pitch. */
  goalsConceded: number;
  tackles: number;
  blocks: number;
  interceptions: number;
  keyPasses: number;
  shotsTotal: number;
  shotsOnTarget: number;
  passesTotal: number;
  /** Pass accuracy 0–100. */
  passesAccuracy: number;
  dribblesSuccess: number;
  foulsDrawn: number;
  foulsCommitted: number;
  offsides: number;
  /** 60+ min played and team conceded 0 while on pitch (derived upstream). */
  cleanSheet: boolean;
}

export interface ScoringMatrix {
  appearance: number;
  appearance_60: number;
  assist: number;
  yellow_card: number;
  red_card: number;
  own_goal: number;
  penalty_miss: number;
  penalty_conceded: number;
  goal: Record<Position, number>;
  clean_sheet: Record<Position, number>;
  /** FPL: −1 per 2 goals conceded (GK/DEF). */
  goals_conceded_per_two: Record<Position, number>;
  penalty_save: number;
  saves_per_point: number;
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
  club_cap: number;
  free_transfers_max: number;
  transfer_penalty: number;
  season_matchday_min: number;
  season_matchday_max: number;
  /**
   * When true the APIs expose API-Football headshot URLs and the UI renders
   * faces; when false they are nulled server-side and every surface falls back
   * to the stylized club kit. Requires the provider media to be licensed.
   */
  photos_enabled: boolean;
  /** BIT defcon thresholds (calibrated spike: DEF 5 / MID·FWD 6). */
  defcon_def_threshold: number;
  defcon_mid_fwd_threshold: number;
  scoring: ScoringMatrix;
  campaign_start: string;
  campaign_end: string;
  features: { emails: boolean; share_cards: boolean; join_open: boolean };
  pending_rescore_matchdays?: number[];
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
  players: { playerId: number; slot: number }[];
  captainId: number;
  viceId: number;
}

/**
 * Auto-sub outcome for a picked slot. "in" = promoted off the bench and
 * scoring, "out" = picked to start but replaced, so the 0 shown is exclusion
 * rather than a blank. null = counted as picked, or an unused bench player.
 */
export type SubState = "in" | "out" | null;

export interface PublicTeamPlayer {
  player_id: number;
  slot: number;
  is_captain: boolean;
  is_vice: boolean;
  name: string;
  position: Position;
  nation: string;
  team_id: number;
  photo_url: string | null;
  points: number;
  minutes: number;
  /**
   * Auto-sub outcome for this round. Players keep their picked slot either
   * way; this is what lets the UI badge the swap in place instead of
   * relocating the card.
   */
  sub_state: SubState;
}

export interface PublicManagerTeam {
  username: string;
  rank: number | null;
  total_points: number;
  /** People this manager referred (server count for share cards). */
  activated_referrals: number;
  badge: string;
  team: {
    matchday: { id: number; display_name: string; status: MatchdayStatus };
    points: number;
    players: PublicTeamPlayer[];
  } | null;
}

export interface LeaderboardRow {
  rank: number;
  username: string | null;
  total_points: number;
  badge: BadgeState;
  movement: number;
  is_me?: boolean;
}

// ─── Scoring worker ───────────────────────────────────────────────────────────

export interface FixtureRow {
  provider_fixture_id: number;
  matchday_id: number;
  home_team_id: number;
  away_team_id: number;
  kickoff: string;
  status: string;
  finished_at: string | null;
  last_stats_sync: string | null;
  stats_finalized: boolean;
}

export type StatsPass = "live" | "post_ft" | "reconcile_final";

export interface WorkerReport {
  ran_at: string;
  /** A matchday window is active — i.e. a game is on (TRD §2.4). Lets the
   * Cloudflare scheduler decide whether to tick faster than once a minute. */
  live_window_active: boolean;
  fixtures_refreshed: boolean;
  transitions: string[];
  /** Squad-player rows stamped with their XI/bench state at kickoff this tick. */
  kickoff_stamps: number;
  stats_synced: number;
  fixtures_finalized: number;
  scores_recomputed: number;
  rolled_over_to: number | null;
  notifications: { sent: number } | "skipped";
  provider_rate_limit: { remaining: number | null; limit: number | null };
  alerts: string[];
}
