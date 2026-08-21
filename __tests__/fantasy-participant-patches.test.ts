jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: jest.fn() },
}));
jest.mock("@/lib/fantasy/settings", () => ({
  getFantasySettings: jest.fn(),
  invalidateFantasySettingsCache: jest.fn(),
}));
jest.mock("@/lib/fantasy/players", () => ({
  getPlayersMap: jest.fn(),
  invalidatePlayersCache: jest.fn(),
}));

import {
  batchUpsertParticipants,
  mergeParticipantPatches,
} from "@/app/lib/fantasy/worker/scoring";

describe("mergeParticipantPatches", () => {
  it("merges duplicate normalized wallets into one payload", () => {
    expect(
      mergeParticipantPatches([
        { wallet_address: "0xABC", total_points: 10 },
        { wallet_address: "0xabc", current_rank: 3 },
        { wallet_address: " 0xAbC ", total_points: 24 },
      ]),
    ).toEqual([{ wallet_address: "0xabc", total_points: 24, current_rank: 3 }]);
  });

  it("later rows override defined fields for the same wallet", () => {
    expect(
      mergeParticipantPatches([
        { wallet_address: "0x1", total_points: 5, current_rank: 9 },
        { wallet_address: "0x1", total_points: 12, previous_rank: 9 },
      ]),
    ).toEqual([
      { wallet_address: "0x1", total_points: 12, current_rank: 9, previous_rank: 9 },
    ]);
  });

  it("leaves distinct wallets separate", () => {
    expect(
      mergeParticipantPatches([
        { wallet_address: "0xaaa", total_points: 1 },
        { wallet_address: "0xbbb", total_points: 2 },
      ]),
    ).toEqual([
      { wallet_address: "0xaaa", total_points: 1 },
      { wallet_address: "0xbbb", total_points: 2 },
    ]);
  });
});

describe("batchUpsertParticipants", () => {
  it("rejects invalid batchSize before any DB access", async () => {
    await expect(
      batchUpsertParticipants([{ wallet_address: "0x1", total_points: 1 }], 0),
    ).rejects.toThrow("batchSize must be a positive integer");
    await expect(
      batchUpsertParticipants([{ wallet_address: "0x1", total_points: 1 }], -1),
    ).rejects.toThrow("batchSize must be a positive integer");
    await expect(
      batchUpsertParticipants([{ wallet_address: "0x1", total_points: 1 }], 1.5),
    ).rejects.toThrow("batchSize must be a positive integer");
  });
});
