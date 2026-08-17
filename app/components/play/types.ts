/**
 * Noblocks Play — client-side API payload types.
 * Mirrors the response envelopes of /api/play/* route handlers.
 * Domain primitives come from the isomorphic app/lib/fantasy/types.ts.
 */

import type {
  BadgeState,
  FantasyPlayer,
  MatchdayStatus,
  Position,
  PublicManagerTeam,
  PublicTeamPlayer,
  ScoringMatrix,
} from "@/app/lib/fantasy/types";

export type {
  BadgeState,
  FantasyPlayer,
  MatchdayStatus,
  Position,
  PublicManagerTeam,
  PublicTeamPlayer,
  ScoringMatrix,
};

export interface PlayMatchday {
  id: number;
  label: string;
  round?: string;
  display_name: string;
  lock_at: string;
  status: MatchdayStatus;
}

/** Squad-builder settings slice returned by GET /api/play/players. */
export interface BuilderSettings {
  budget: number;
  squad_size: number;
  positions: Record<Position, number>;
  formations: string[];
  club_cap: number;
  transfer_penalty: number;
  free_transfers_max?: number;
  photos_enabled?: boolean;
  defcon_def_threshold?: number;
  defcon_mid_fwd_threshold?: number;
  /** Full scoring matrix — drives the "How to score" panel. */
  scoring: ScoringMatrix;
}

export interface PlayersResponse {
  players: FantasyPlayer[];
  settings: BuilderSettings;
  matchday: PlayMatchday | null;
}

export type LockState = "unlocked" | "locked" | "played";

export interface SquadPlayerEntry {
  player_id: number;
  slot: number;
  is_captain: boolean;
  is_vice: boolean;
  player?: FantasyPlayer;
  lock_state: LockState;
  live: { points: number; minutes: number };
}

export interface SquadData {
  id: string;
  wallet_address: string;
  matchday_id: number;
  budget_spent: number;
  free_transfers_remaining: number;
  transfer_points_deduction: number;
  is_initial: boolean;
  players: SquadPlayerEntry[];
}

export interface SquadResponse {
  matchday: PlayMatchday;
  locked: boolean;
  /** True while at least one fixture is on the pitch (drives live polling). */
  game_active: boolean;
  squad: SquadData | null;
  /** Free transfers granted for the current matchday (settings value). */
  free_transfers: number;
  total_points: number;
  /** Own leaderboard handle — drives the squad share card. */
  username: string | null;
  /** Own points per matchday (drives the round strip's pills). */
  matchday_scores: { matchday_id: number; points: number }[];
}

export interface SaveSquadBody {
  players: { playerId: number; slot: number }[];
  captainId: number;
  viceId: number;
}

export interface TransfersBody {
  transfers: { out: number; in: number }[];
}

export interface TransfersResponse {
  applied: number;
  free_transfers_remaining: number;
  points_cost: number;
  total_deduction: number;
}

export interface LeaderboardRowData {
  rank: number;
  username: string | null;
  total_points: number;
  badge: BadgeState;
  movement: number;
  is_me: boolean;
}

export interface LeaderboardResponse {
  rows: LeaderboardRowData[];
  page: number;
  page_size: number;
  total: number;
}

export interface LeagueStandingRow {
  wallet_address: string;
  username: string | null;
  points: number;
  transfers: number;
  rank: number;
  joined_gameweek: number;
  is_me: boolean;
}

export interface LeagueSummary {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  member_count: number;
  standings: LeagueStandingRow[];
}

export interface RewardsResponse {
  stub: boolean;
  message: string;
  rank: number | null;
  total_points: number;
  leagues: LeagueSummary[];
}

export interface FixtureData {
  provider_fixture_id: number;
  home_team: string;
  away_team: string;
  home_team_id: number;
  away_team_id: number;
  kickoff: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
}

export interface MatchdayResponse {
  matchday: Pick<
    PlayMatchday,
    "id" | "label" | "display_name" | "lock_at" | "status"
  >;
  fixtures: FixtureData[];
}

export interface JoinResponse {
  joined: boolean;
  already_joined: boolean;
  username: string | null;
}

export interface UsernameCheckResponse {
  available: boolean;
  reason?: string;
  suggestions?: string[];
}

export {
  FIXTURE_FINISHED_STATUSES,
  FIXTURE_LIVE_STATUSES,
} from "@/app/lib/fantasy/fixture-activity";
