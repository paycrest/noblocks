/**
 * League standings — join-week scoring, tie-breaks, and ranks.
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }));
jest.mock("@/lib/fantasy/settings", () => ({ getFantasySettings: jest.fn() }));

import { rankLeagueStandings, type LeagueMemberInput } from "@/app/lib/fantasy/leagues";

const member = (
  wallet: string,
  joinedGameweek: number,
  joinedAt = "2026-08-01T00:00:00Z",
): LeagueMemberInput => ({
  wallet_address: wallet,
  joined_at: joinedAt,
  joined_gameweek: joinedGameweek,
});

const score = (wallet: string, matchdayId: number, points: number) => ({
  wallet_address: wallet,
  matchday_id: matchdayId,
  points,
});

const transfer = (wallet: string, matchdayId: number) => ({
  wallet_address: wallet,
  matchday_id: matchdayId,
});

const rank = (input: Partial<Parameters<typeof rankLeagueStandings>[0]>) =>
  rankLeagueStandings({
    members: [],
    scores: [],
    transfers: [],
    usernameByWallet: new Map(),
    viewerWallet: "0xviewer",
    ...input,
  });

describe("join-week scoring", () => {
  it("only counts points from each member's joined_gameweek onward", () => {
    const rows = rank({
      members: [member("0xa", 101), member("0xb", 103)],
      scores: [
        score("0xa", 101, 50),
        score("0xa", 102, 40),
        score("0xb", 101, 90), // before 0xb joined — must NOT count
        score("0xb", 102, 90), // before 0xb joined — must NOT count
        score("0xb", 103, 60),
      ],
    });
    expect(rows.find((r) => r.wallet_address === "0xa")?.points).toBe(90);
    expect(rows.find((r) => r.wallet_address === "0xb")?.points).toBe(60);
    expect(rows[0].wallet_address).toBe("0xa");
  });

  it("only counts transfers from the join week onward", () => {
    const rows = rank({
      members: [member("0xa", 103)],
      transfers: [transfer("0xa", 101), transfer("0xa", 102), transfer("0xa", 103)],
    });
    expect(rows[0].transfers).toBe(1);
  });
});

describe("tie-breaks and ranks", () => {
  it("equal points → fewer transfers wins", () => {
    const rows = rank({
      members: [member("0xa", 101), member("0xb", 101)],
      scores: [score("0xa", 101, 50), score("0xb", 101, 50)],
      transfers: [transfer("0xa", 101), transfer("0xa", 102)],
    });
    expect(rows[0].wallet_address).toBe("0xb");
    expect(rows[0].rank).toBe(1);
    expect(rows[1].rank).toBe(2);
  });

  it("equal points and transfers → earlier join time wins", () => {
    const rows = rank({
      members: [
        member("0xlate", 101, "2026-08-02T00:00:00Z"),
        member("0xearly", 101, "2026-08-01T00:00:00Z"),
      ],
      scores: [score("0xlate", 101, 50), score("0xearly", 101, 50)],
    });
    expect(rows[0].wallet_address).toBe("0xearly");
  });

  it("ranks are dense 1..n in sorted order", () => {
    const rows = rank({
      members: [member("0xa", 101), member("0xb", 101), member("0xc", 101)],
      scores: [score("0xa", 101, 10), score("0xb", 101, 30), score("0xc", 101, 20)],
    });
    expect(rows.map((r) => [r.wallet_address, r.rank])).toEqual([
      ["0xb", 1],
      ["0xc", 2],
      ["0xa", 3],
    ]);
  });
});

describe("viewer and profile mapping", () => {
  it("flags the viewer row and maps usernames, defaulting to null", () => {
    const rows = rank({
      members: [member("0xviewer", 101), member("0xother", 101)],
      usernameByWallet: new Map([["0xviewer", "prof"]]),
    });
    const me = rows.find((r) => r.wallet_address === "0xviewer")!;
    const other = rows.find((r) => r.wallet_address === "0xother")!;
    expect(me.is_me).toBe(true);
    expect(me.username).toBe("prof");
    expect(other.is_me).toBe(false);
    expect(other.username).toBeNull();
  });

  it("members with no scores rank with 0 points", () => {
    const rows = rank({ members: [member("0xa", 101)] });
    expect(rows[0].points).toBe(0);
    expect(rows[0].rank).toBe(1);
  });
});
