import Decimal from "decimal.js";
import {
  assertTotalMatchesBuckets,
  buildPortfolioSummary,
} from "../app/lib/portfolio/builder";
import {
  collectWalletUsdExclusionKeys,
  portfolioOverlapKey,
  shouldExcludeWalletHoldingFromUsd,
} from "../app/lib/portfolio/overlap";
import { portfolioMoneyDecimalPrecision } from "../app/lib/portfolio/money";
import type {
  PortfolioBuildInputHolding,
  PortfolioPriceLookup,
} from "../app/lib/portfolio/types";

const asOf = "2026-11-05T12:00:00.000Z";

function row(
  partial: Partial<PortfolioBuildInputHolding> &
    Pick<
      PortfolioBuildInputHolding,
      "chain" | "symbol" | "amount" | "bucket" | "positionId"
    >,
): PortfolioBuildInputHolding {
  return {
    tokenAddress: "0xtoken",
    decimals: 6,
    asOf,
    ...partial,
  };
}

describe("portfolio overlap keys", () => {
  it("uses chain + symbol + positionId", () => {
    expect(portfolioOverlapKey("Base", "USDC", "wallet")).toBe(
      "base:USDC:wallet",
    );
    expect(portfolioOverlapKey("Starknet", "usdc", "0xpool")).toBe(
      "starknet:USDC:0xpool",
    );
  });

  it("excludes wallet USD only for evm-earn-source on same chain+symbol", () => {
    const holdings: PortfolioBuildInputHolding[] = [
      row({
        chain: "Base",
        symbol: "USDC",
        amount: "100.000000",
        bucket: "tokens",
        positionId: "wallet",
      }),
      row({
        chain: "Base",
        symbol: "USDC",
        amount: "100.000000",
        bucket: "earn",
        positionId: "evm-earn-source",
      }),
    ];
    const exclusions = collectWalletUsdExclusionKeys(holdings);
    expect(
      shouldExcludeWalletHoldingFromUsd(holdings[0], exclusions),
    ).toBe(true);
  });

  it("does not exclude wallet USD for Vesu pool earn", () => {
    const holdings: PortfolioBuildInputHolding[] = [
      row({
        chain: "Starknet",
        symbol: "USDC",
        amount: "10.000000",
        bucket: "tokens",
        positionId: "wallet",
      }),
      row({
        chain: "Starknet",
        symbol: "USDC",
        amount: "90.000000",
        bucket: "earn",
        positionId: "0x01bc5de51365ed7fbb11ebc81cef9fd66b70050ec10fd898f0c4698765bf5803",
      }),
    ];
    const exclusions = collectWalletUsdExclusionKeys(holdings);
    expect(
      shouldExcludeWalletHoldingFromUsd(holdings[0], exclusions),
    ).toBe(false);
  });
});

describe("portfolio money", () => {
  it("uses a cloned Decimal without changing global precision", () => {
    const before = Decimal.precision;
    expect(portfolioMoneyDecimalPrecision()).toBe(40);
    expect(Decimal.precision).toBe(before);
  });
});

describe("buildPortfolioSummary", () => {
  const usd1: PortfolioPriceLookup = async () => ({
    usdPerUnit: "1",
    priceUnavailable: false,
    stale: false,
    asOf,
  });

  it("sums bucket USD into total with decimal strings", async () => {
    const summary = await buildPortfolioSummary(
      [
        row({
          chain: "Base",
          symbol: "USDC",
          amount: "10.000000",
          bucket: "tokens",
          positionId: "wallet",
        }),
        row({
          chain: "Starknet",
          symbol: "USDC",
          amount: "5.000000",
          bucket: "earn",
          positionId: "0xpool",
        }),
      ],
      usd1,
    );

    expect(summary.buckets.tokens.totalUsd).toBe("10");
    expect(summary.buckets.earn.totalUsd).toBe("5");
    expect(summary.buckets.stocks.totalUsd).toBe("0");
    expect(summary.totalUsd).toBe("15");
    expect(assertTotalMatchesBuckets(summary)).toBe(true);
  });

  it("uses fallback asOf for empty stocks bucket (not unix epoch)", async () => {
    const summary = await buildPortfolioSummary(
      [
        row({
          chain: "Base",
          symbol: "USDC",
          amount: "1.000000",
          bucket: "tokens",
          positionId: "wallet",
        }),
      ],
      usd1,
    );
    expect(summary.buckets.stocks.asOf).toBe(asOf);
    expect(summary.buckets.stocks.asOf).not.toMatch(/^1970-01-01/);
  });

  it("bucket asOf is max timestamp within that bucket only", async () => {
    const tokenAsOf = "2026-11-05T10:00:00.000Z";
    const earnAsOf = "2026-11-05T14:00:00.000Z";
    const summary = await buildPortfolioSummary(
      [
        row({
          chain: "Base",
          symbol: "USDC",
          amount: "1.000000",
          bucket: "tokens",
          positionId: "wallet",
          asOf: tokenAsOf,
        }),
        row({
          chain: "Starknet",
          symbol: "USDC",
          amount: "2.000000",
          bucket: "earn",
          positionId: "0xpool",
          asOf: earnAsOf,
        }),
      ],
      usd1,
    );
    expect(summary.buckets.tokens.asOf).toBe(tokenAsOf);
    expect(summary.buckets.earn.asOf).toBe(earnAsOf);
  });

  it("de-dupes earn overlap from tokens USD but keeps earn USD", async () => {
    const summary = await buildPortfolioSummary(
      [
        row({
          chain: "Base",
          symbol: "USDC",
          amount: "100.000000",
          bucket: "tokens",
          positionId: "wallet",
        }),
        row({
          chain: "Base",
          symbol: "USDC",
          amount: "100.000000",
          bucket: "earn",
          positionId: "evm-earn-source",
        }),
      ],
      usd1,
    );

    expect(summary.buckets.tokens.totalUsd).toBe("0");
    expect(summary.buckets.earn.totalUsd).toBe("100");
    expect(summary.totalUsd).toBe("100");
    expect(summary.buckets.tokens.holdings[0].usd).toBeNull();
  });

  it("counts Vesu wallet and earn USD separately", async () => {
    const summary = await buildPortfolioSummary(
      [
        row({
          chain: "Starknet",
          symbol: "USDC",
          amount: "10.000000",
          bucket: "tokens",
          positionId: "wallet",
        }),
        row({
          chain: "Starknet",
          symbol: "USDC",
          amount: "90.000000",
          bucket: "earn",
          positionId: "0xpool",
        }),
      ],
      usd1,
    );
    expect(summary.buckets.tokens.totalUsd).toBe("10");
    expect(summary.buckets.earn.totalUsd).toBe("90");
    expect(summary.totalUsd).toBe("100");
  });

  it("flags priceUnavailable and excludes row from USD totals", async () => {
    const lookup: PortfolioPriceLookup = async (symbol) => {
      if (symbol === "ETH") {
        return {
          usdPerUnit: null,
          priceUnavailable: true,
          stale: false,
          asOf: null,
        };
      }
      return {
        usdPerUnit: "1",
        priceUnavailable: false,
        stale: false,
        asOf,
      };
    };

    const summary = await buildPortfolioSummary(
      [
        row({
          chain: "Base",
          symbol: "ETH",
          amount: "1.000000",
          bucket: "tokens",
          positionId: "wallet",
          decimals: 18,
        }),
        row({
          chain: "Base",
          symbol: "USDC",
          amount: "2.000000",
          bucket: "tokens",
          positionId: "wallet",
        }),
      ],
      lookup,
    );

    expect(summary.buckets.tokens.holdings[0].priceUnavailable).toBe(true);
    expect(summary.buckets.tokens.holdings[0].usd).toBeNull();
    expect(summary.buckets.tokens.totalUsd).toBe("2");
    expect(new Decimal(summary.totalUsd).eq("2")).toBe(true);
  });

  it("marks stale rows on the bucket", async () => {
    const summary = await buildPortfolioSummary(
      [
        row({
          chain: "Base",
          symbol: "USDC",
          amount: "1.000000",
          bucket: "tokens",
          positionId: "wallet",
          stale: true,
        }),
      ],
      usd1,
    );
    expect(summary.buckets.tokens.stale).toBe(true);
    expect(summary.stale).toBe(true);
  });

  it("memoizes price lookup per symbol", async () => {
    const calls: string[] = [];
    const lookup: PortfolioPriceLookup = async (symbol) => {
      calls.push(symbol);
      return {
        usdPerUnit: "1",
        priceUnavailable: false,
        stale: false,
        asOf,
      };
    };
    await buildPortfolioSummary(
      [
        row({
          chain: "Base",
          symbol: "USDC",
          amount: "1",
          bucket: "tokens",
          positionId: "wallet",
        }),
        row({
          chain: "Polygon",
          symbol: "USDC",
          amount: "2",
          bucket: "tokens",
          positionId: "wallet",
        }),
      ],
      lookup,
    );
    expect(calls).toEqual(["USDC"]);
  });
});
