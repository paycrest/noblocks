import { canonicalTokenSymbol } from "@/app/lib/token-symbol";

/** Maps supported wallet symbols → market-data registry ids (KAN-955). */
const SYMBOL_TO_MARKET_ID: Record<string, string> = {
  USDC: "usdc",
  USDT: "usdt",
  ETH: "eth",
  WETH: "eth",
  CNGN: "cngn",
  cNGN: "cngn",
  CUSD: "cusd",
  cUSD: "cusd",
};

export function resolveMarketTokenId(symbol: string): string | null {
  const canonical = canonicalTokenSymbol(symbol) ?? symbol.trim();
  if (!canonical) return null;
  const upper = canonical.toUpperCase();
  return SYMBOL_TO_MARKET_ID[canonical] ?? SYMBOL_TO_MARKET_ID[upper] ?? null;
}

export type TokenHistoryRange = "1D" | "1W" | "1M" | "1Y" | "ALL";

export const TOKEN_HISTORY_RANGES: TokenHistoryRange[] = [
  "1D",
  "1W",
  "1M",
  "1Y",
  "ALL",
];

export function isTokenHistoryRange(raw: string): raw is TokenHistoryRange {
  return TOKEN_HISTORY_RANGES.includes(raw as TokenHistoryRange);
}
