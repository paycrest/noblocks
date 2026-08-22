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

import { supabaseAdmin } from "../app/lib/supabase";

import {
  batchUpsertParticipants,
  mergeParticipantPatches,
} from "@/app/lib/fantasy/worker/scoring";

const from = supabaseAdmin.from as unknown as jest.Mock;

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
  beforeEach(() => from.mockReset());

  it("rejects invalid batchSize before any DB access", async () => {
    for (const batchSize of [0, -1, 1.5]) {
      await expect(
        batchUpsertParticipants([{ wallet_address: "0x1", total_points: 1 }], batchSize),
      ).rejects.toThrow("batchSize must be a positive integer");
      expect(from).not.toHaveBeenCalled();
    }
  });

  it("caps in-flight participant updates regardless of batch size", async () => {
    const rows = Array.from({ length: 120 }, (_, i) => ({
      wallet_address: `0x${i}`,
      total_points: i,
    }));

    let inFlight = 0;
    let peakInFlight = 0;
    const updated: string[] = [];

    from.mockImplementation((table: string) => {
      if (table !== "fantasy_participants") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          in: (_col: string, wallets: string[]) =>
            Promise.resolve({
              data: wallets.map((w) => ({ wallet_address: w })),
              error: null,
            }),
        }),
        update: () => ({
          eq: async (_col: string, wallet: string) => {
            inFlight += 1;
            peakInFlight = Math.max(peakInFlight, inFlight);
            await new Promise((resolve) => setTimeout(resolve, 0));
            inFlight -= 1;
            updated.push(wallet);
            return { error: null };
          },
        }),
      };
    });

    await batchUpsertParticipants(rows);

    expect(updated).toHaveLength(120);
    expect(peakInFlight).toBeGreaterThan(1);
    expect(peakInFlight).toBeLessThanOrEqual(25);
  });

  it("propagates the first update error", async () => {
    from.mockImplementation(() => ({
      select: () => ({
        in: (_col: string, wallets: string[]) =>
          Promise.resolve({
            data: wallets.map((w) => ({ wallet_address: w })),
            error: null,
          }),
      }),
      update: () => ({
        eq: async () => ({ error: { message: "boom" } }),
      }),
    }));

    await expect(
      batchUpsertParticipants([{ wallet_address: "0x1", total_points: 1 }]),
    ).rejects.toEqual({ message: "boom" });
  });
});
