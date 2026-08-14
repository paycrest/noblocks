import "server-only";
import { supabaseAdmin } from "../supabase";
import type { FantasySettings, Position, ScoringMatrix } from "./types";

const CACHE_TTL_MS = 60_000;

/** Code-level defaults so warm instances never filter on undefined season bounds. */
export const SEASON_MATCHDAY_MIN_DEFAULT = 101;
export const SEASON_MATCHDAY_MAX_DEFAULT = 138;

/** BIT defcon thresholds (calibrated spike: DEF 5 / MID·FWD 6). */
export const DEFCON_DEF_THRESHOLD_DEFAULT = 5;
export const DEFCON_MID_FWD_THRESHOLD_DEFAULT = 6;

const DEFAULT_SCORING: ScoringMatrix = {
  appearance: 1,
  appearance_60: 1,
  assist: 3,
  yellow_card: -1,
  red_card: -3,
  own_goal: -2,
  penalty_miss: -2,
  penalty_conceded: 0,
  goal: { GK: 10, DEF: 6, MID: 5, FWD: 4 },
  clean_sheet: { GK: 4, DEF: 4, MID: 1, FWD: 0 },
  goals_conceded_per_two: { GK: -1, DEF: -1, MID: 0, FWD: 0 },
  penalty_save: 5,
  saves_per_point: 3,
};

let cached: { settings: FantasySettings; expiresAt: number } | null = null;

function requireNumber(obj: Record<string, unknown>, key: string): number {
  const v = obj[key];
  if (typeof v !== "number" || Number.isNaN(v)) {
    throw new Error(`fantasy_settings.config missing number: ${key}`);
  }
  return v;
}

function requireBool(obj: Record<string, unknown>, key: string): boolean {
  const v = obj[key];
  if (typeof v !== "boolean") {
    throw new Error(`fantasy_settings.config missing boolean: ${key}`);
  }
  return v;
}

function assertScoring(raw: unknown): ScoringMatrix {
  if (!raw || typeof raw !== "object") {
    throw new Error("fantasy_settings.config.scoring missing");
  }
  const s = raw as Record<string, unknown>;
  for (const key of [
    "appearance",
    "appearance_60",
    "assist",
    "yellow_card",
    "red_card",
    "own_goal",
    "penalty_miss",
    "penalty_save",
    "saves_per_point",
  ] as const) {
    if (typeof s[key] !== "number") {
      throw new Error(`fantasy_settings.config.scoring.${key} missing`);
    }
  }
  for (const mapKey of ["goal", "clean_sheet", "goals_conceded_per_two"] as const) {
    const m = s[mapKey];
    if (!m || typeof m !== "object") {
      throw new Error(`fantasy_settings.config.scoring.${mapKey} missing`);
    }
    for (const pos of ["GK", "DEF", "MID", "FWD"] as Position[]) {
      if (typeof (m as Record<string, unknown>)[pos] !== "number") {
        throw new Error(`fantasy_settings.config.scoring.${mapKey}.${pos} missing`);
      }
    }
  }
  return s as unknown as ScoringMatrix;
}

/** Throws if required EPL keys are absent. Fills season bounds from code defaults when missing. */
export function assertSettings(raw: unknown): FantasySettings {
  if (!raw || typeof raw !== "object") {
    throw new Error("fantasy_settings.config is not an object");
  }
  const c = raw as Record<string, unknown>;

  const seasonMin =
    typeof c.season_matchday_min === "number"
      ? c.season_matchday_min
      : SEASON_MATCHDAY_MIN_DEFAULT;
  const seasonMax =
    typeof c.season_matchday_max === "number"
      ? c.season_matchday_max
      : SEASON_MATCHDAY_MAX_DEFAULT;

  const features = c.features;
  if (!features || typeof features !== "object") {
    throw new Error("fantasy_settings.config.features missing");
  }

  const settings: FantasySettings = {
    budget: requireNumber(c, "budget"),
    squad_size: requireNumber(c, "squad_size"),
    positions: c.positions as FantasySettings["positions"],
    formations: c.formations as string[],
    club_cap: requireNumber(c, "club_cap"),
    free_transfers_max: requireNumber(c, "free_transfers_max"),
    transfer_penalty: requireNumber(c, "transfer_penalty"),
    season_matchday_min: seasonMin,
    season_matchday_max: seasonMax,
    photos_enabled: requireBool(c, "photos_enabled"),
    defcon_def_threshold:
      typeof c.defcon_def_threshold === "number"
        ? c.defcon_def_threshold
        : DEFCON_DEF_THRESHOLD_DEFAULT,
    defcon_mid_fwd_threshold:
      typeof c.defcon_mid_fwd_threshold === "number"
        ? c.defcon_mid_fwd_threshold
        : DEFCON_MID_FWD_THRESHOLD_DEFAULT,
    scoring: assertScoring(c.scoring ?? DEFAULT_SCORING),
    campaign_start: String(c.campaign_start ?? ""),
    campaign_end: String(c.campaign_end ?? ""),
    features: features as FantasySettings["features"],
    pending_rescore_matchdays: Array.isArray(c.pending_rescore_matchdays)
      ? (c.pending_rescore_matchdays as number[])
      : undefined,
  };

  if (!settings.positions || typeof settings.positions !== "object") {
    throw new Error("fantasy_settings.config.positions missing");
  }
  if (!Array.isArray(settings.formations) || settings.formations.length === 0) {
    throw new Error("fantasy_settings.config.formations missing");
  }
  if (settings.season_matchday_min > settings.season_matchday_max) {
    throw new Error("fantasy_settings season_matchday_min > max");
  }

  return settings;
}

export async function getFantasySettings(): Promise<FantasySettings> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.settings;

  const { data, error } = await supabaseAdmin
    .from("fantasy_settings")
    .select("config")
    .eq("id", 1)
    .single();

  if (error || !data) {
    throw new Error(`Failed to load fantasy_settings: ${error?.message ?? "no row"}`);
  }

  const settings = assertSettings(data.config);
  cached = { settings, expiresAt: now + CACHE_TTL_MS };
  return settings;
}

export function invalidateFantasySettingsCache() {
  cached = null;
}

/** Display gameweek number from offset id (101 → 1). */
export function gameweekNumber(matchdayId: number, settings: FantasySettings): number {
  return matchdayId - settings.season_matchday_min + 1;
}
