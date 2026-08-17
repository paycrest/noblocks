jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }));
jest.mock("@/lib/kyc-identity", () => ({ resolveIdentityScope: jest.fn() }));
jest.mock("@/lib/server-analytics", () => ({ trackBusinessEvent: jest.fn() }));

import { readFileSync } from "fs";
import path from "path";

import {
  hasTwoClearGameweeks,
  MAX_MONTHLY_CHALLENGE_PRIZE_USDC,
  validateChallengeCreate,
} from "@/app/lib/fantasy/challenges";

describe("challenge anti-abuse: two clear gameweeks", () => {
  it("requires joined_gameweek ≤ challengeGw − 2", () => {
    // Challenge GW5 (id 105): must have joined by GW3 (103) or earlier.
    expect(hasTwoClearGameweeks(103, 105)).toBe(true);
    expect(hasTwoClearGameweeks(102, 105)).toBe(true);
    expect(hasTwoClearGameweeks(104, 105)).toBe(false);
    expect(hasTwoClearGameweeks(105, 105)).toBe(false);
  });

  it("fails for brand-new league join on challenge week", () => {
    expect(hasTwoClearGameweeks(101, 101)).toBe(false);
    expect(hasTwoClearGameweeks(101, 102)).toBe(false);
    expect(hasTwoClearGameweeks(101, 103)).toBe(true);
  });
});

describe("createChallenge validation", () => {
  const bounds = { seasonMatchdayMin: 101, seasonMatchdayMax: 138 };

  it("rejects gameweek ids outside the season", () => {
    expect(() =>
      validateChallengeCreate({ gameweekId: 6, prizeUsdc: 10, ...bounds }),
    ).toThrow("OUT_OF_SEASON");
    expect(() =>
      validateChallengeCreate({ gameweekId: 999, prizeUsdc: 10, ...bounds }),
    ).toThrow("OUT_OF_SEASON");
  });

  it("accepts in-season gameweeks with a valid prize", () => {
    expect(() =>
      validateChallengeCreate({ gameweekId: 101, prizeUsdc: 10, ...bounds }),
    ).not.toThrow();
    expect(() =>
      validateChallengeCreate({
        gameweekId: 138,
        prizeUsdc: MAX_MONTHLY_CHALLENGE_PRIZE_USDC,
        ...bounds,
      }),
    ).not.toThrow();
  });

  it("rejects invalid minLeagueSize values", () => {
    expect(() =>
      validateChallengeCreate({ gameweekId: 101, prizeUsdc: 10, minLeagueSize: 1, ...bounds }),
    ).toThrow("INVALID_MIN_LEAGUE_SIZE");
    expect(() =>
      validateChallengeCreate({ gameweekId: 101, prizeUsdc: 10, minLeagueSize: NaN, ...bounds }),
    ).toThrow("INVALID_MIN_LEAGUE_SIZE");
    expect(() =>
      validateChallengeCreate({ gameweekId: 101, prizeUsdc: 10, minLeagueSize: 5, ...bounds }),
    ).not.toThrow();
  });

  it("rejects World Cup legacy matchday ids (outside EPL season)", () => {
    expect(() =>
      validateChallengeCreate({ gameweekId: 6, prizeUsdc: 10, ...bounds }),
    ).toThrow("OUT_OF_SEASON");
  });
});

describe("challenge prize budget", () => {
  // Enforcement lives in fantasy_create_challenge so the read-and-insert is
  // atomic; there is deliberately no second copy of the rule in TS. Pin the
  // SQL instead, so deleting the guard turns this suite red.
  const migration = readFileSync(
    path.join(
      process.cwd(),
      "supabase/migrations/20260811120000_epl_fantasy_season.sql",
    ),
    "utf8",
  );
  const fn = migration.slice(
    migration.indexOf("FUNCTION public.fantasy_create_challenge"),
  );

  it("serialises the budget check so concurrent creates can't both pass", () => {
    expect(fn).toContain("pg_advisory_xact_lock");
    expect(fn.indexOf("pg_advisory_xact_lock")).toBeLessThan(
      fn.indexOf("SELECT COALESCE(SUM(prize_usdc)"),
    );
  });

  it("rejects a single prize over the ceiling and the trailing-window total", () => {
    expect(fn).toMatch(/p_prize_usdc\s*>\s*p_max_budget[\s\S]*?RAISE EXCEPTION 'PRIZE_TOO_HIGH'/);
    expect(fn).toMatch(
      /v_spent\s*\+\s*p_prize_usdc\s*>\s*p_max_budget[\s\S]*?RAISE EXCEPTION 'PRIZE_BUDGET_EXCEEDED'/,
    );
  });

  it("passes the app's ceiling through as the budget argument", () => {
    const challenges = readFileSync(
      path.join(process.cwd(), "app/lib/fantasy/challenges.ts"),
      "utf8",
    );
    expect(challenges).toMatch(/p_max_budget:\s*MAX_MONTHLY_CHALLENGE_PRIZE_USDC/);
    expect(MAX_MONTHLY_CHALLENGE_PRIZE_USDC).toBe(100);
  });
});
