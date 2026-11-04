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
import { logMarketDataWarning } from "./log";
import {
  cmcNumberToString,
  multiplyDecimalStrings,
  redactErrorMessage,
} from "./validate";
import type { TokenStatsBlock } from "./types";
import type { StatsProvider } from "./provider";

const CMC_URL =
  "https://pro-api.coinmarketcap.com/v3/cryptocurrency/quotes/latest";

const CMC_DAILY_CODES = new Set([1009, 1010]);

function pickUsdQuote(
  quoteField: unknown,
): Record<string, unknown> | null {
  if (!quoteField) return null;
  if (Array.isArray(quoteField)) {
    const usd = quoteField.find(
      (q) =>
        q &&
        typeof q === "object" &&
        String((q as Record<string, unknown>).symbol).toUpperCase() === "USD",
    );
    return (usd as Record<string, unknown>) ?? null;
  }
  if (typeof quoteField === "object") {
    const obj = quoteField as Record<string, unknown>;
    if (obj.USD && typeof obj.USD === "object") {
      return obj.USD as Record<string, unknown>;
    }
  }
  return null;
}

function normalizeCmcEntries(data: unknown): Record<string, unknown>[] {
  if (!data || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;
  const payload = root.data;
  if (Array.isArray(payload)) {
    return payload.filter((e) => e && typeof e === "object") as Record<
      string,
      unknown
    >[];
  }
  if (payload && typeof payload === "object") {
    return Object.values(payload as Record<string, unknown>).filter(
      (e) => e && typeof e === "object",
    ) as Record<string, unknown>[];
  }
  return [];
}

function findEntryByCmcId(
  entries: Record<string, unknown>[],
  cmcId: number,
): Record<string, unknown> | null {
  const idStr = String(cmcId);
  for (const entry of entries) {
    if (String(entry.id) === idStr) return entry;
  }
  return null;
}

export function mapCmcEntryToStats(
  entry: Record<string, unknown>,
  marketCapMode: "reported" | "totalSupply",
): TokenStatsBlock | null {
  const usd = pickUsdQuote(entry.quote);
  if (!usd) return null;

  const volume24h = cmcNumberToString(usd.volume_24h);
  let marketCap = cmcNumberToString(usd.market_cap);
  const circulatingSupply = cmcNumberToString(entry.circulating_supply);
  const totalSupply = cmcNumberToString(entry.total_supply);
  const price = cmcNumberToString(usd.price);

  if (marketCapMode === "totalSupply" && totalSupply && price) {
    marketCap = multiplyDecimalStrings(totalSupply, price);
  }

  const asOfRaw = usd.last_updated ?? entry.last_updated;
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

/** Parses CMC quotes/latest. Returns null when zero registry ids matched. */
export function parseCmcResponse(
  data: unknown,
): Record<number, TokenStatsBlock> | null {
  if (!data || typeof data !== "object") return null;
  const errorCode = extractCmcErrorCode(data);
  if (errorCode && errorCode !== 0) {
    if (errorCode === 1008) {
      applyCmcRateLimitBackoff(429, 1008);
    } else if (CMC_DAILY_CODES.has(errorCode)) {
      applyCmcRateLimitBackoff(429, errorCode);
    }
    return null;
  }

  const entries = normalizeCmcEntries(data);
  const byId: Record<number, TokenStatsBlock> = {};

  for (const registryEntry of allRegistryEntries()) {
    const raw = findEntryByCmcId(entries, registryEntry.cmcId);
    if (!raw) continue;
    const stats = mapCmcEntryToStats(
      raw,
      registryEntry.marketCapMode ?? "reported",
    );
    if (stats) byId[registryEntry.cmcId] = stats;
  }

  if (Object.keys(byId).length === 0) return null;
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
      logMarketDataWarning("cmc_fetch_error", {
        httpStatus: status,
        errorCode: errorCode ?? -1,
        matchedIds: 0,
      });
      return null;
    }
    if (status < 200 || status >= 300) {
      logMarketDataWarning("cmc_fetch_error", {
        httpStatus: status,
        errorCode: errorCode ?? -1,
        matchedIds: 0,
      });
      return null;
    }

    const parsed = parseCmcResponse(data);
    const matchedIds = parsed ? Object.keys(parsed).length : 0;
    logMarketDataWarning("cmc_fetch_result", {
      httpStatus: status,
      errorCode: errorCode ?? 0,
      matchedIds,
    });

    if (!parsed) return null;

    recordCmcCall();
    return parsed;
  } catch (err) {
    logMarketDataWarning("cmc_fetch_failed", {
      message: redactErrorMessage(err),
    });
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
