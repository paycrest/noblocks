import {
  clearPortfolioHoldingsCache,
  portfolioCacheKey,
  setCachedPortfolioHoldings,
  getCachedPortfolioHoldings,
} from "../app/lib/portfolio/cache.server";

describe("portfolioCacheKey", () => {
  beforeEach(() => {
    clearPortfolioHoldingsCache();
  });

  const evm = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

  it("includes linked Starknet address so relinks do not share cache", () => {
    const k1 = portfolioCacheKey({
      evmBalanceAddress: evm,
      starknetAddress: "0x111",
      tronAddress: null,
    });
    const k2 = portfolioCacheKey({
      evmBalanceAddress: evm,
      starknetAddress: "0x222",
      tronAddress: null,
    });
    expect(k1).not.toBe(k2);
  });

  it("includes Tron address with base58 casing preserved", () => {
    const lower = portfolioCacheKey({
      evmBalanceAddress: evm,
      starknetAddress: null,
      tronAddress: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
    });
    const different = portfolioCacheKey({
      evmBalanceAddress: evm,
      starknetAddress: null,
      tronAddress: "txyzopYrdj2D9XRtbG411XZZ3kM5VkAeBf",
    });
    expect(lower).not.toBe(different);
  });

  it("isolates cache entries per wallet context", () => {
    const ctxA = portfolioCacheKey({
      evmBalanceAddress: evm,
      starknetAddress: "0xaaa",
      tronAddress: null,
    });
    const ctxB = portfolioCacheKey({
      evmBalanceAddress: evm,
      starknetAddress: "0xbbb",
      tronAddress: null,
    });

    setCachedPortfolioHoldings(ctxA, {
      holdings: [],
      asOf: "2026-11-05T10:00:00.000Z",
      stale: false,
    });

    expect(getCachedPortfolioHoldings(ctxA)).not.toBeNull();
    expect(getCachedPortfolioHoldings(ctxB)).toBeNull();
  });
});
