import {
  calculateCorrectedTotalBalance,
  isPaycrestGatewayAddress,
} from "../app/utils";

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

describe("isPaycrestGatewayAddress", () => {
  it("returns true for known Base gateway refund sender", () => {
    expect(
      isPaycrestGatewayAddress("0x30f6a8457f8e42371e204a9c103f2bd42341dd0f"),
    ).toBe(true);
  });

  it("returns false for arbitrary wallet addresses", () => {
    expect(
      isPaycrestGatewayAddress("0x0c89b146E1dB0A1cf325e0bBA4FfFF24e3F1d0D4"),
    ).toBe(false);
  });

  it("returns false when address is missing", () => {
    expect(isPaycrestGatewayAddress(undefined)).toBe(false);
    expect(isPaycrestGatewayAddress("")).toBe(false);
  });
});
