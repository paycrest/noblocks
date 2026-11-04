import "server-only";

import axios from "axios";
import Decimal from "decimal.js";
import { getCoinMarketCapApiKey } from "@/app/lib/server-config";
import { allRegistryEntries } from "./assets";
import {
  applyCmcRateLimitBackoff,
  canSpendCmcCredit,
  isCmcInBackoff,
  recordCmcCall,
  setCachedStats,
  setNegativeCache,
  withSingleFlight,
} from "./cache";
import { cmcNumberToString, multiplyDecimalStrings, redactErrorMessage } from "./validate";
import type { TokenStatsBlock } from "./types";
import type { StatsProvider } from "./provider";

const CMC_URL =
  "https://pro-api.coinmarketcap.com/v3/cryptocurrency/quotes/latest";

const CMC_DAILY_CODES = new Set([1009, 1010]);

function mapQuoteToStats(
  quote: Record<string, unknown>,
  marketCapMode: "reported" | "totalSupply",
): TokenStatsBlock {
  const usd = (quote.usd ?? quote) as Record<string, unknown>;
  const volume24h = cmcNumberToString(usd.volume_24h);
  let marketCap = cmcNumberToString(usd.market_cap);
  const circulatingSupply = cmcNumberToString(usd.circulating_supply);
  const totalSupply = cmcNumberToString(usd.total_supply);
  const price = cmcNumberToString(usd.price);

  if (marketCapMode === "totalSupply" && totalSupply && price) {
    marketCap = multiplyDecimalStrings(totalSupply, price);
  }

  const asOfRaw = usd.last_updated ?? quote.last_updated;
  const asOf =
    typeof asOfRaw === "string"
      ? asOfRaw
      : new Date().toISOString();

  return {
    volume24h,
    marketCap,
    circulatingSupply:
      marketCapMode === "totalSupply" ? totalSupply : circulatingSupply,
    totalSupply,
    marketCapMode,
    asOf,
    source: "coinmarketcap",
    stale: false,
  };
}

function extractCmcErrorCode(data: unknown): number | undefined {
  if (!data || typeof data !== "object") return undefined;
  const status = (data as Record<string, unknown>).status as
    | { error_code?: number }
    | undefined;
  const code = status?.error_code;
  return typeof code === "number" ? code : undefined;
}

function parseCmcResponse(data: unknown): Record<number, TokenStatsBlock> | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const errorCode = extractCmcErrorCode(data);
  if (errorCode && errorCode !== 0) {
    if (errorCode === 1008) {
      applyCmcRateLimitBackoff(429, 1008);
    } else if (CMC_DAILY_CODES.has(errorCode)) {
      applyCmcRateLimitBackoff(429, errorCode);
    }
    return null;
  }
  const payload = root.data as Record<string, unknown> | undefined;
  if (!payload) return null;

  const byId: Record<number, TokenStatsBlock> = {};
  for (const entry of allRegistryEntries()) {
    const raw = payload[String(entry.cmcId)] as Record<string, unknown> | undefined;
    if (!raw) continue;
    const quotes = raw.quote as Record<string, unknown> | undefined;
    const usd = quotes?.USD as Record<string, unknown> | undefined;
    if (!usd) continue;
    byId[entry.cmcId] = mapQuoteToStats(
      { ...usd, last_updated: raw.last_updated },
      entry.marketCapMode ?? "reported",
    );
  }
  return byId;
}

async function fetchCmcQuotes(): Promise<Record<number, TokenStatsBlock> | null> {
  const apiKey = getCoinMarketCapApiKey();
  if (!apiKey) return null;
  if (isCmcInBackoff()) return null;
  if (!canSpendCmcCredit()) return null;

  const ids = allRegistryEntries()
    .map((e) => e.cmcId)
    .join(",");

  try {
    const { data, status } = await axios.get(CMC_URL, {
      params: { id: ids, convert: "USD" },
      headers: { "X-CMC_PRO_API_KEY": apiKey },
      timeout: 5_000,
      maxRedirects: 0,
      validateStatus: () => true,
    });

    const errorCode = extractCmcErrorCode(data);
    if (status === 429 || (errorCode && errorCode !== 0)) {
      applyCmcRateLimitBackoff(status, errorCode);
      return null;
    }
    if (status < 200 || status >= 300) return null;

    const parsed = parseCmcResponse(data);
    if (!parsed) return null;

    recordCmcCall();
    return parsed;
  } catch (err) {
    console.warn("[market-data] CMC fetch failed:", redactErrorMessage(err));
    return null;
  }
}

const BATCH_CACHE_KEY = "cmc:all";

export const coinMarketCapStatsProvider: StatsProvider = {
  async fetchAllStats() {
    return withSingleFlight(BATCH_CACHE_KEY, async () => {
      const fresh = await fetchCmcQuotes();
      if (fresh) {
        for (const entry of allRegistryEntries()) {
          const block = fresh[entry.cmcId];
          if (block) setCachedStats(entry.id, block);
        }
        return fresh;
      }
      setNegativeCache(BATCH_CACHE_KEY);
      return null;
    });
  },
};

export function getCmcMarketPrice(
  all: Record<number, TokenStatsBlock> | null,
  cmcId: number,
): string | null {
  if (!all) return null;
  const stats = all[cmcId];
  if (!stats) return null;
  const cap = stats.marketCap;
  const supply = stats.totalSupply;
  if (cap && supply) {
    try {
      return new Decimal(cap).div(supply).toFixed();
    } catch {
      return null;
    }
  }
  return null;
}
