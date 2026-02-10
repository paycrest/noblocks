import { calculateCorrectedTotalBalance } from "../app/utils";

describe("calculateCorrectedTotalBalance", () => {
  it("excludes CNGN face value from total when rate is null", () => {
    const rawBalance = {
      total: 1600,
      balances: {
        USDC: 100,
        cNGN: 1500,
      },
    };

    expect(calculateCorrectedTotalBalance(rawBalance, null)).toBe(100);
  });

  it("excludes CNGN face value from total when rate is non-positive", () => {
    const rawBalance = {
      total: 1600,
      balances: {
        USDC: 100,
        CNGN: 1500,
      },
    };

    expect(calculateCorrectedTotalBalance(rawBalance, 0)).toBe(100);
  });

  it("converts CNGN into USD equivalent when rate is available", () => {
    const rawBalance = {
      total: 1600,
      balances: {
        USDC: 100,
        cNGN: 1500,
      },
    };

    expect(calculateCorrectedTotalBalance(rawBalance, 1500)).toBe(101);
  });
});
