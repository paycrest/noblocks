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

  it("excludes wallet USD when earn position exists on same chain+symbol", () => {
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
});
