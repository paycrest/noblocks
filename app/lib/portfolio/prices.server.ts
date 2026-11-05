import "server-only";

import { getTokenMarketSnapshot } from "@/app/lib/market-data/service";
import { resolveMarketTokenId } from "@/app/lib/tokens/market-id";
import type { PortfolioPriceLookup, PortfolioPriceQuote } from "./types";

export function createMarketDataPriceLookup(): PortfolioPriceLookup {
  return async (symbol: string): Promise<PortfolioPriceQuote> => {
    const id = resolveMarketTokenId(symbol);
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
