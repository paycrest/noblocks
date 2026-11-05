import { findPhaseLastRoundGallop } from "../app/lib/market-data/history-resolver";

describe("findPhaseLastRoundGallop", () => {
  function existsUpTo(maxRound: number) {
    return async (agg: bigint) => Number(agg) >= 1 && Number(agg) <= maxRound;
  }

  it.each([223_609, 30_162, 9_242, 131_073, 81_91])(
    "returns exact last round %i (not a power of two)",
    async (maxRound) => {
      const last = await findPhaseLastRoundGallop(existsUpTo(maxRound));
      expect(last).toBe(BigInt(maxRound));
    },
  );

  it("does not stop at the last successful power of two", async () => {
    const maxRound = 223_609;
    const last = await findPhaseLastRoundGallop(existsUpTo(maxRound));
    expect(last).not.toBe(BigInt(131_072));
    expect(last).toBe(BigInt(maxRound));
  });
});
