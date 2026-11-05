import Decimal from "decimal.js";
import { FALLBACK_TOKENS } from "@/app/utils";
import { canonicalTokenSymbol, tokensEqual } from "@/app/lib/token-symbol";
import { formatPortfolioUsd } from "@/app/lib/portfolio/display";

const money = Decimal.clone({ precision: 40 });

export function resolveTokenImageUrl(symbol: string): string | undefined {
  const canonical = canonicalTokenSymbol(symbol);
  for (const networkTokens of Object.values(FALLBACK_TOKENS)) {
    const match = networkTokens.find((t) => tokensEqual(t.symbol, canonical));
    if (match?.imageUrl) return match.imageUrl;
  }
  return undefined;
}

export function formatTokenDetailBalanceAmount(amount: string): string {
  try {
    const value = money(amount.trim());
    if (value.isZero()) return "0";
    const maximumFractionDigits = value.abs().gte(1) ? 4 : 6;
    return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(
      value.toNumber(),
    );
  } catch {
    return "0";
  }
}

export function formatTokenBalanceAmount(amount: string): string {
  try {
    const value = money(amount.trim());
    if (value.isZero()) return "0";
    const abs = value.abs();
    const maximumFractionDigits = abs.gte(1000)
      ? 2
      : abs.gte(1)
        ? 4
        : 6;
    return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(
      value.toNumber(),
    );
  } catch {
    return "0";
  }
}

export function formatTokenRowUsd(usd: string | null): string {
  if (usd == null) return "—";
  return formatPortfolioUsd(usd);
}

export function formatMarketPriceUsd(price: string): string {
  return formatPortfolioUsd(price);
}
