import Decimal from "decimal.js";
import { canonicalTokenSymbol } from "@/app/lib/token-symbol";
import {
  collectWalletUsdExclusionKeys,
  shouldExcludeWalletHoldingFromUsd,
} from "./overlap";
import {
  isZeroDecimalString,
  multiplyAmountByPrice,
  sumUsdStrings,
} from "./money";
import type {
  PortfolioBucket,
  PortfolioBucketName,
  PortfolioBuildInputHolding,
  PortfolioHolding,
  PortfolioPriceLookup,
  PortfolioSummary,
} from "./types";

function holdingRowId(h: PortfolioBuildInputHolding): string {
  const sym = canonicalTokenSymbol(h.symbol) ?? h.symbol;
  return `${h.bucket}:${h.chain}:${sym}:${h.positionId}:${h.tokenAddress}`.toLowerCase();
}

function latestIso(a: string, b: string): string {
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

async function buildBucket(
  name: PortfolioBucketName,
  rows: PortfolioBuildInputHolding[],
  priceLookup: PortfolioPriceLookup,
  walletUsdExclusions: Set<string>,
): Promise<PortfolioBucket> {
  const holdings: PortfolioHolding[] = [];
  const usdParts: string[] = [];
  let bucketStale = false;
  let bucketAsOf = new Date(0).toISOString();

  for (const row of rows) {
    if (row.bucket !== name) continue;

    const quote = await priceLookup(row.symbol);
    let usd: string | null = null;
    let priceUnavailable = quote.priceUnavailable;

    if (!quote.priceUnavailable && quote.usdPerUnit != null) {
      usd = multiplyAmountByPrice(row.amount, quote.usdPerUnit);
    }

    const excludeFromTokensUsd =
      name === "tokens" &&
      shouldExcludeWalletHoldingFromUsd(row, walletUsdExclusions);

    if (usd != null && !excludeFromTokensUsd) {
      usdParts.push(usd);
    }

    if (row.stale) bucketStale = true;
    if (quote.stale) bucketStale = true;
    bucketAsOf = latestIso(bucketAsOf, row.asOf);

    holdings.push({
      id: holdingRowId(row),
      chain: row.chain,
      symbol: canonicalTokenSymbol(row.symbol) ?? row.symbol,
      amount: row.amount,
      usd: excludeFromTokensUsd ? null : usd,
      ...(priceUnavailable ? { priceUnavailable: true } : {}),
      ...(row.readOnly ? { readOnly: true } : {}),
      ...(row.stale ? { stale: true } : {}),
      asOf: row.asOf,
      positionId: row.positionId,
    });
  }

  return {
    totalUsd: sumUsdStrings(usdParts),
    stale: bucketStale,
    asOf: bucketAsOf,
    holdings,
  };
}

/**
 * Pure portfolio builder: decimal-string amounts, USD from price lookup,
 * bucket totals are exact sums of included row USD values.
 */
export async function buildPortfolioSummary(
  inputHoldings: PortfolioBuildInputHolding[],
  priceLookup: PortfolioPriceLookup,
): Promise<PortfolioSummary> {
  const walletUsdExclusions = collectWalletUsdExclusionKeys(inputHoldings);

  const tokens = await buildBucket(
    "tokens",
    inputHoldings,
    priceLookup,
    walletUsdExclusions,
  );
  const earn = await buildBucket(
    "earn",
    inputHoldings,
    priceLookup,
    walletUsdExclusions,
  );
  const stocks = await buildBucket(
    "stocks",
    inputHoldings,
    priceLookup,
    walletUsdExclusions,
  );

  const totalUsd = sumUsdStrings([
    tokens.totalUsd,
    earn.totalUsd,
    stocks.totalUsd,
  ]);

  const stale = tokens.stale || earn.stale || stocks.stale;
  const asOf = [tokens.asOf, earn.asOf, stocks.asOf].reduce(latestIso);

  return {
    success: true,
    totalUsd,
    stale,
    asOf,
    buckets: { tokens, earn, stocks },
  };
}

/** Filters zero-amount rows before building (keeps explicit zero earn if needed). */
export function filterNonZeroHoldings(
  rows: PortfolioBuildInputHolding[],
): PortfolioBuildInputHolding[] {
  return rows.filter((r) => !isZeroDecimalString(r.amount));
}

export function assertTotalMatchesBuckets(summary: PortfolioSummary): boolean {
  const sum = sumUsdStrings([
    summary.buckets.tokens.totalUsd,
    summary.buckets.earn.totalUsd,
    summary.buckets.stocks.totalUsd,
  ]);
  return new Decimal(summary.totalUsd).eq(sum);
}
