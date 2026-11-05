import {
  clearPortfolioHoldingsCache,
  expirePortfolioHoldingsCache,
  portfolioCacheKey,
  setCachedPortfolioHoldings,
} from "../app/lib/portfolio/cache.server";
import { buildPortfolioForWallet } from "../app/lib/portfolio/service.server";
import type { PortfolioWalletContext } from "../app/lib/portfolio/wallet-context.server";

jest.mock("../app/lib/portfolio/fetch-holdings.server", () => ({
  fetchPortfolioHoldings: jest.fn(),
}));

jest.mock("../app/lib/portfolio/prices.server", () => ({
  createMarketDataPriceLookup: () => async () => ({
    usdPerUnit: "1",
    priceUnavailable: false,
    stale: false,
    asOf: "2026-11-05T12:00:00.000Z",
  }),
}));

import { fetchPortfolioHoldings } from "../app/lib/portfolio/fetch-holdings.server";

const mockedFetch = fetchPortfolioHoldings as jest.MockedFunction<
  typeof fetchPortfolioHoldings
>;

const ctx: PortfolioWalletContext = {
  primaryEvm: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  evmBalanceAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  starknetAddress: null,
  tronAddress: null,
};

describe("portfolio stale cache", () => {
  beforeEach(() => {
    clearPortfolioHoldingsCache();
    jest.clearAllMocks();
  });

  it("reuses last holdings with stale=true when refresh throws", async () => {
    const key = portfolioCacheKey(ctx.evmBalanceAddress);
    setCachedPortfolioHoldings(key, {
      holdings: [
        {
          chain: "Base",
          symbol: "USDC",
          tokenAddress: "0xusdc",
          amount: "3.000000",
          decimals: 6,
          bucket: "tokens",
          positionId: "wallet",
          asOf: "2026-11-05T10:00:00.000Z",
        },
      ],
      asOf: "2026-11-05T10:00:00.000Z",
      stale: false,
    });

    expirePortfolioHoldingsCache(key);

    mockedFetch.mockRejectedValue(new Error("rpc timeout"));

    const summary = await buildPortfolioForWallet(ctx);
    expect(summary.stale).toBe(true);
    expect(summary.asOf).toBe("2026-11-05T10:00:00.000Z");
    expect(summary.buckets.tokens.totalUsd).toBe("3");
  });

  it("keeps prior cache when refreshFailed would cache empty zeros", async () => {
    const key = portfolioCacheKey(ctx.evmBalanceAddress);
    setCachedPortfolioHoldings(key, {
      holdings: [
        {
          chain: "Base",
          symbol: "USDC",
          tokenAddress: "0xusdc",
          amount: "5.000000",
          decimals: 6,
          bucket: "tokens",
          positionId: "wallet",
          asOf: "2026-11-05T10:00:00.000Z",
        },
      ],
      asOf: "2026-11-05T10:00:00.000Z",
      stale: false,
    });

    expirePortfolioHoldingsCache(key);

    mockedFetch.mockResolvedValue({
      holdings: [],
      stale: true,
      asOf: "2026-11-05T12:00:00.000Z",
      refreshFailed: true,
    });

    const summary = await buildPortfolioForWallet(ctx);
    expect(summary.stale).toBe(true);
    expect(summary.asOf).toBe("2026-11-05T10:00:00.000Z");
    expect(summary.buckets.tokens.totalUsd).toBe("5");
  });
});
