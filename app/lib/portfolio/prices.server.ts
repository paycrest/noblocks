import "server-only";

import { canonicalTokenSymbol } from "@/app/lib/token-symbol";
import { getTokenMarketSnapshot } from "@/app/lib/market-data/service";
import type { PortfolioPriceLookup, PortfolioPriceQuote } from "./types";

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

function resolveMarketId(symbol: string): string | null {
  const canonical = canonicalTokenSymbol(symbol) ?? symbol.trim().toUpperCase();
  return SYMBOL_TO_MARKET_ID[canonical] ?? null;
}

export function createMarketDataPriceLookup(): PortfolioPriceLookup {
  return async (symbol: string): Promise<PortfolioPriceQuote> => {
    const id = resolveMarketId(symbol);
    if (!id) {
      return {
        usdPerUnit: null,
        priceUnavailable: true,
        stale: false,
        asOf: null,
      };
    }
    try {
      const snap = await getTokenMarketSnapshot(id);
      return {
        usdPerUnit: snap.price,
        priceUnavailable: false,
        stale: snap.stale,
        asOf: snap.asOf,
      };
    } catch {
      return {
        usdPerUnit: null,
        priceUnavailable: true,
        stale: false,
        asOf: null,
      };
    }
  };
}
