import Decimal from "decimal.js";
import {
  mapCmcEntryToStats,
  parseCmcResponse,
} from "../app/lib/market-data/coinmarketcap";
import { computeCngnBadge } from "../app/lib/market-data/cngn";
import { ASSET_REGISTRY } from "../app/lib/market-data/assets";

/** Realistic v3 quotes/latest shape (data array, quote array per entry). */
const V3_FIXTURE = {
  status: { error_code: 0, error_message: null },
  data: [
    {
      id: 3408,
      symbol: "USDC",
      circulating_supply: 70000000000,
      total_supply: 70000000000,
      quote: [
        {
          symbol: "USD",
          price: 0.9998,
          volume_24h: 5000000000,
          market_cap: 69986000000,
          percent_change_24h: 0.01,
          last_updated: "2026-11-04T12:00:00.000Z",
        },
      ],
    },
    {
      id: 825,
      symbol: "USDT",
      circulating_supply: 120000000000,
      total_supply: 120000000000,
      quote: [
        {
          symbol: "USD",
          price: 1.0001,
          volume_24h: 80000000000,
          market_cap: 120012000000,
          percent_change_24h: 0.02,
          last_updated: "2026-11-04T12:00:00.000Z",
        },
      ],
    },
    {
      id: 1027,
      symbol: "ETH",
      circulating_supply: 120000000,
      total_supply: 120000000,
      quote: [
        {
          symbol: "USD",
          price: 2500.5,
          volume_24h: 15000000000,
          market_cap: 300060000000,
          percent_change_24h: -1.2,
          last_updated: "2026-11-04T12:00:00.000Z",
        },
      ],
    },
    {
      id: 7236,
      symbol: "CUSD",
      circulating_supply: 50000000,
      total_supply: 50000000,
      quote: [
        {
          symbol: "USD",
          price: 1.0002,
          volume_24h: 1000000,
          market_cap: 50010000,
          percent_change_24h: 0,
          last_updated: "2026-11-04T12:00:00.000Z",
        },
      ],
    },
    {
      id: 29207,
      symbol: "CNGN",
      circulating_supply: 0,
      total_supply: 4566021844,
      quote: [
        {
          symbol: "USD",
          price: 0.00072286,
          volume_24h: 120000,
          market_cap: 0,
          percent_change_24h: -0.5,
          last_updated: "2026-11-04T12:00:00.000Z",
        },
      ],
    },
  ],
};

describe("CMC v3 quotes/latest parsing", () => {
  it("matches registry ids from array payload and quote arrays", () => {
    const parsed = parseCmcResponse(V3_FIXTURE);
    expect(parsed).not.toBeNull();
    expect(Object.keys(parsed!)).toEqual(
      expect.arrayContaining(["3408", "825", "1027", "7236", "29207"]),
    );
  });

  it("returns null when no registry ids match (no empty cache object)", () => {
    expect(
      parseCmcResponse({ status: { error_code: 0 }, data: [] }),
    ).toBeNull();
  });

  it("computes cNGN market cap from total supply × price when reported cap is zero", () => {
    const entry = V3_FIXTURE.data.find((e) => e.id === 29207)!;
    const stats = mapCmcEntryToStats(entry, "totalSupply");
    expect(stats).not.toBeNull();
    const cap = new Decimal(stats!.marketCap!);
    expect(cap.div(1_000_000).toFixed(2)).toBe("3.30");
    expect(stats!.circulatingSupply).toBe(stats!.totalSupply);
  });

  it("shows cNGN depeg badge at ~−2.68% vs Chainlink reference", () => {
    const entry = V3_FIXTURE.data.find((e) => e.id === 29207)!;
    const stats = mapCmcEntryToStats(entry, "totalSupply");
    const marketPrice = new Decimal(stats!.marketCap!)
      .div(stats!.totalSupply!)
      .toFixed();
    expect(marketPrice).toBe("0.00072286");

    const badge = computeCngnBadge({
      referencePrice: "0.00074279",
      cmcMarketPrice: marketPrice,
      referenceFresh: true,
      cmcFresh: true,
    });
    expect(badge?.showBadge).toBe(true);
    expect(Number(badge!.gapPct)).toBeCloseTo(-2.68, 1);
  });

  it("uses v2 object-keyed data fallback", () => {
    const v2 = {
      status: { error_code: 0 },
      data: {
        "3408": {
          id: 3408,
          circulating_supply: 1,
          total_supply: 1,
          quote: { USD: { price: 1, volume_24h: 1, market_cap: 1 } },
        },
      },
    };
    const parsed = parseCmcResponse(v2);
    expect(parsed?.[3408]?.marketCap).toBe("1");
  });
});

describe("cNGN registry marketCapMode", () => {
  it("is totalSupply for badge path", () => {
    expect(ASSET_REGISTRY.cngn.marketCapMode).toBe("totalSupply");
  });
});
