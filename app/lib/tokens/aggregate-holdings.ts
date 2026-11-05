import Decimal from "decimal.js";
import { canonicalTokenSymbol, tokensEqual } from "@/app/lib/token-symbol";
import { resolveWalletTokenMeta } from "@/app/lib/wallet-token-allowlist";
import { isZeroDecimalString } from "@/app/lib/portfolio/money";
import type { PortfolioHolding } from "@/app/lib/portfolio/types";

const money = Decimal.clone({ precision: 40 });

export type AggregatedTokenHolding = {
  symbol: string;
  name: string;
  /** Sum of token amounts (decimal string). */
  amount: string;
  /** Sum of row USD values; null when no priced rows contributed. */
  usd: string | null;
  priceUnavailable: boolean;
};

export function tokenDetailHref(symbol: string): string {
  const canonical = canonicalTokenSymbol(symbol) ?? symbol;
  return `/tokens/${encodeURIComponent(canonical)}`;
}

export function aggregateTokenHoldings(
  holdings: PortfolioHolding[],
): AggregatedTokenHolding[] {
  const bySymbol = new Map<
    string,
    {
      amount: InstanceType<typeof money>;
      usdParts: string[];
      priceUnavailable: boolean;
    }
  >();

  for (const row of holdings) {
    if (isZeroDecimalString(row.amount)) continue;
    const symbol = canonicalTokenSymbol(row.symbol) ?? row.symbol;
    let entry = bySymbol.get(symbol);
    if (!entry) {
      entry = {
        amount: money(0),
        usdParts: [],
        priceUnavailable: false,
      };
      bySymbol.set(symbol, entry);
    }
    entry.amount = entry.amount.plus(row.amount.trim());
    if (row.usd != null && !isZeroDecimalString(row.usd)) {
      entry.usdParts.push(row.usd.trim());
    }
    if (row.priceUnavailable) {
      entry.priceUnavailable = true;
    }
  }

  const rows: AggregatedTokenHolding[] = [];
  for (const [symbol, entry] of bySymbol) {
    const meta = resolveWalletTokenMeta(symbol);
    rows.push({
      symbol,
      name: meta?.name ?? symbol,
      amount: entry.amount.toFixed(),
      usd:
        entry.usdParts.length > 0
          ? entry.usdParts
              .reduce((acc, part) => acc.plus(part), money(0))
              .toFixed()
          : null,
      priceUnavailable: entry.priceUnavailable,
    });
  }

  return sortTokenHoldingsByUsd(rows);
}

export function sortTokenHoldingsByUsd(
  rows: AggregatedTokenHolding[],
): AggregatedTokenHolding[] {
  return [...rows].sort((a, b) => {
    const rank = (usd: string | null) => {
      if (usd == null) return money(-1);
      try {
        return money(usd.trim());
      } catch {
        return money(-1);
      }
    };
    return rank(b.usd).comparedTo(rank(a.usd));
  });
}

export function findAggregatedHolding(
  rows: AggregatedTokenHolding[],
  symbol: string,
): AggregatedTokenHolding | null {
  return (
    rows.find((row) => tokensEqual(row.symbol, symbol)) ?? null
  );
}
