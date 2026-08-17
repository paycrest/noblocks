jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }));

import { readFileSync } from "fs";
import path from "path";

import {
  assertSettings,
  DEFCON_DEF_THRESHOLD_DEFAULT,
  DEFCON_MID_FWD_THRESHOLD_DEFAULT,
  SEASON_MATCHDAY_MIN_DEFAULT,
  SEASON_MATCHDAY_MAX_DEFAULT,
} from "@/app/lib/fantasy/settings";

/** Mirrors app/lib/fantasy/server.ts previousMatchday / nextMatchday (pure). */
function previousMatchday<T extends { id: number }>(
  matchdays: T[],
  currentId: number,
): T | null {
  const idx = matchdays.findIndex((m) => m.id === currentId);
  if (idx <= 0) return null;
  return matchdays[idx - 1] ?? null;
}
function nextMatchday<T extends { id: number }>(
  matchdays: T[],
  currentId: number,
): T | null {
  const idx = matchdays.findIndex((m) => m.id === currentId);
  if (idx < 0 || idx >= matchdays.length - 1) return null;
  return matchdays[idx + 1] ?? null;
}

describe("season matchday neighbors (never id±1 arithmetic across seasons)", () => {
  const season = [{ id: 101 }, { id: 102 }, { id: 103 }, { id: 104 }];

  it("previous/next walk the season list", () => {
    expect(previousMatchday(season, 103)?.id).toBe(102);
    expect(nextMatchday(season, 102)?.id).toBe(103);
    expect(previousMatchday(season, 101)).toBeNull();
    expect(nextMatchday(season, 104)).toBeNull();
  });

  it("does not invent neighbors for missing WC ids", () => {
    expect(previousMatchday(season, 7)).toBeNull();
    expect(nextMatchday(season, 8)).toBeNull();
  });
});

describe("assertSettings", () => {
  const base = {
    budget: 100,
    squad_size: 15,
    positions: { GK: 2, DEF: 5, MID: 5, FWD: 3 },
    formations: ["4-4-2"],
    club_cap: 3,
    free_transfers_max: 5,
    transfer_penalty: 4,
    season_matchday_min: 101,
    season_matchday_max: 138,
    photos_enabled: false,
    defcon_def_threshold: 5,
    defcon_mid_fwd_threshold: 6,
    scoring: {
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
    },
    campaign_start: "2026-08-01T00:00:00Z",
    campaign_end: "2027-05-31T00:00:00Z",
    features: { emails: false, share_cards: true, join_open: true },
  };

  it("accepts a full EPL config", () => {
    const s = assertSettings(base);
    expect(s.budget).toBe(100);
    expect(s.club_cap).toBe(3);
    expect(s.season_matchday_min).toBe(101);
  });

  it("fills season bounds from code defaults when omitted", () => {
    const { season_matchday_min: _a, season_matchday_max: _b, ...rest } = base;
    const s = assertSettings(rest);
    expect(s.season_matchday_min).toBe(SEASON_MATCHDAY_MIN_DEFAULT);
    expect(s.season_matchday_max).toBe(SEASON_MATCHDAY_MAX_DEFAULT);
  });

  it("fills defcon thresholds from code defaults when omitted", () => {
    const { defcon_def_threshold: _a, defcon_mid_fwd_threshold: _b, ...rest } = base;
    const s = assertSettings(rest);
    expect(s.defcon_def_threshold).toBe(DEFCON_DEF_THRESHOLD_DEFAULT);
    expect(s.defcon_mid_fwd_threshold).toBe(DEFCON_MID_FWD_THRESHOLD_DEFAULT);
  });

  it("throws when club_cap is missing", () => {
    const { club_cap: _, ...rest } = base;
    expect(() => assertSettings(rest)).toThrow(/club_cap/);
  });
});

describe("shipped settings match the season migration", () => {
  // The code defaults exist so assertSettings can fill gaps, but the migration
  // is what production actually loads. If the two drift, every scoring test
  // stays green while the live engine uses different numbers.
  const migration = readFileSync(
    path.join(
      process.cwd(),
      "supabase/migrations/20260811120000_epl_fantasy_season.sql",
    ),
    "utf8",
  );

  it("defcon thresholds agree with the code defaults", () => {
    expect(migration).toMatch(
      new RegExp(`"defcon_def_threshold":\\s*${DEFCON_DEF_THRESHOLD_DEFAULT}`),
    );
    expect(migration).toMatch(
      new RegExp(`"defcon_mid_fwd_threshold":\\s*${DEFCON_MID_FWD_THRESHOLD_DEFAULT}`),
    );
  });

  it("season bounds agree with the code defaults", () => {
    expect(migration).toMatch(
      new RegExp(`"season_matchday_min":\\s*${SEASON_MATCHDAY_MIN_DEFAULT}`),
    );
    expect(migration).toMatch(
      new RegExp(`"season_matchday_max":\\s*${SEASON_MATCHDAY_MAX_DEFAULT}`),
    );
  });
});
