jest.mock("../app/lib/server-analytics", () => ({
  trackApiRequest: jest.fn(),
  trackApiResponse: jest.fn(),
  trackApiError: jest.fn(),
}));

jest.mock("../app/lib/market-data/chainlink", () => {
  const actual = jest.requireActual("../app/lib/market-data/chainlink");
  return {
    ...actual,
    chainlinkPriceProvider: {
      readLatest: jest.fn(),
      readAt: jest.fn(),
      readHistoryAtTimestamps: jest.fn(),
    },
  };
});

jest.mock("../app/lib/market-data/coinmarketcap", () => {
  const actual = jest.requireActual("../app/lib/market-data/coinmarketcap");
  return {
    ...actual,
    coinMarketCapStatsProvider: {
      fetchAllStats: jest.fn(),
    },
  };
});

import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { chainlinkPriceProvider } from "../app/lib/market-data/chainlink";
import { coinMarketCapStatsProvider } from "../app/lib/market-data/coinmarketcap";
import {
  ASSET_REGISTRY,
  expectedRegistryIdsFromFallbackTokens,
  isValidMarketTokenId,
  parseHistoryRange,
} from "../app/lib/market-data/assets";
import {
  CACHE_TTLS,
  applyCmcRateLimitBackoff,
  blockPriceFetchBriefly,
  canSpendCmcCredit,
  getCmcBackoffUntilForTests,
  getCmcCallsTodayForTests,
  isCmcInBackoff,
  isPriceFetchBlocked,
  maxCmcCallsPerDayPerInstance,
  recordCmcCall,
  resetMarketDataCachesForTests,
  setCachedStats,
} from "../app/lib/market-data/cache";
import { resetHistoryBucketCacheForTests } from "../app/lib/market-data/history-cache";
import { computeCngnBadge } from "../app/lib/market-data/cngn";
import {
  HISTORY_DEADLINE_MS,
  historyDeadlineExceeded,
  pickRoundForBucket,
} from "../app/lib/market-data/round-history";
import {
  evaluateSequencerStatus,
  isSequencerOperational,
  SEQUENCER_GRACE_PERIOD_SEC,
} from "../app/lib/market-data/sequencer";
import { applySpikeFilter } from "../app/lib/market-data/series";
import {
  answerToDecimalString,
  isFeedAnswerStale,
  isNgnForexMarketClosed,
  isStablecoinBandOk,
  redactSensitiveUrl,
} from "../app/lib/market-data/validate";
import {
  getTokenHistory,
  getTokenMarketSnapshot,
} from "../app/lib/market-data/service";

const mockedReadLatest = chainlinkPriceProvider.readLatest as jest.Mock;
const mockedReadAt = chainlinkPriceProvider.readAt as jest.Mock;
const mockedHistory = chainlinkPriceProvider.readHistoryAtTimestamps as jest.Mock;
const mockedCmc = coinMarketCapStatsProvider.fetchAllStats as jest.Mock;

function mockRound(overrides: Partial<{ answer: bigint; updatedAt: number }> = {}) {
  return {
    round: {
      answer: overrides.answer ?? 99983000n,
      updatedAt: overrides.updatedAt ?? Math.floor(Date.now() / 1000) - 60,
      decimals: 8,
      chain: "base" as const,
      pairSlug: "usdc-usd",
      stale: false,
      marketClosed: false,
    },
    derived: false,
  };
}

beforeEach(() => {
  resetMarketDataCachesForTests();
  resetHistoryBucketCacheForTests();
  mockedReadLatest.mockReset();
  mockedReadAt.mockReset();
  mockedHistory.mockReset();
  mockedCmc.mockReset();
  delete process.env.COINMARKETCAP_API_KEY;
  delete process.env.MARKET_DATA_RPC_KEY;
  delete process.env.MARKET_CMC_MONTHLY_BUDGET;
  delete process.env.MARKET_DATA_REPLICAS;
});

describe("registry and validation", () => {
  it("maps every FALLBACK_TOKENS symbol to a registry entry", () => {
    for (const id of expectedRegistryIdsFromFallbackTokens()) {
      expect(ASSET_REGISTRY[id]).toBeDefined();
    }
  });

  it("rejects unknown ids without calling upstream", async () => {
    mockedReadLatest.mockResolvedValue(mockRound());
    expect(isValidMarketTokenId("not-a-token")).toBe(false);
    expect(isValidMarketTokenId("USDC")).toBe(false);
    expect(mockedReadLatest).not.toHaveBeenCalled();
  });

  it("parses history range enum only", () => {
    expect(parseHistoryRange("1d")).toBe("1D");
    expect(parseHistoryRange("ALL")).toBe("ALL");
    expect(parseHistoryRange("2D")).toBeNull();
  });
});

describe("validate helpers", () => {
  it("converts chainlink answers to decimal strings without float math", () => {
    expect(answerToDecimalString(74279000n, 8)).toBe("0.74279");
  });

  it("flags stale oracle past heartbeat x1.5", () => {
    const now = 1_700_000_000;
    const feed = ASSET_REGISTRY.usdc.price;
    expect(
      isFeedAnswerStale(feed, now - feed.heartbeatS * 2, now).stale,
    ).toBe(true);
  });

  it("does not mark NGN stale during forex-closed windows", () => {
    const saturday = Date.parse("2026-11-07T12:00:00Z");
    expect(isNgnForexMarketClosed(saturday)).toBe(true);
    const feed = ASSET_REGISTRY.cngn.price;
    const nowSec = Math.floor(saturday / 1000);
    const { stale, marketClosed } = isFeedAnswerStale(
      feed,
      nowSec - feed.heartbeatS * 10,
      nowSec,
    );
    expect(marketClosed).toBe(true);
    expect(stale).toBe(false);
  });

  it("rejects stablecoin answers outside 0.90–1.10", () => {
    const feed = ASSET_REGISTRY.usdc.price;
    expect(isStablecoinBandOk(feed, "1.25")).toBe(false);
  });

  it("redacts dwellir RPC keys from error text", () => {
    const redacted = redactSensitiveUrl(
      "failed https://api-base-mainnet-archive.n.dwellir.com/secret-key-123",
    );
    expect(redacted).not.toContain("secret-key");
  });
});

describe("spike filter", () => {
  it("drops stablecoin spikes beyond 5%", () => {
    const base = 1.0;
    const points = [
      { t: 1, p: base.toString() },
      { t: 2, p: base.toString() },
      { t: 3, p: "1.20" },
      { t: 4, p: base.toString() },
    ];
    const filtered = applySpikeFilter(points, { stableOrNgn: true });
    expect(filtered.some((p) => p.p === "1.20")).toBe(false);
  });
});

describe("sequencer uptime", () => {
  const now = 1_700_000_000;

  it("treats answer 0 as up after grace period", () => {
    expect(
      evaluateSequencerStatus(
        BigInt(0),
        now - SEQUENCER_GRACE_PERIOD_SEC - 10,
        now,
      ),
    ).toBe("up");
    expect(
      isSequencerOperational(
        BigInt(0),
        now - SEQUENCER_GRACE_PERIOD_SEC - 10,
        now,
      ),
    ).toBe(true);
  });

  it("treats answer 1 as down", () => {
    expect(evaluateSequencerStatus(BigInt(1), now - 100, now)).toBe("down");
  });

  it("treats answer 0 within grace as not operational", () => {
    expect(
      evaluateSequencerStatus(BigInt(0), now - 100, now),
    ).toBe("grace");
    expect(
      isSequencerOperational(BigInt(0), now - 100, now),
    ).toBe(false);
  });
});

describe("price unavailable cache", () => {
  it("blocks repeat fetches briefly after failure", () => {
    resetMarketDataCachesForTests();
    blockPriceFetchBriefly("usdc");
    expect(isPriceFetchBlocked("usdc")).toBe(true);
    expect(CACHE_TTLS.priceUnavailableMs).toBe(15_000);
  });
});

describe("history deadline helpers", () => {
  it("detects deadline expiry", () => {
    expect(historyDeadlineExceeded(Date.now() - 1)).toBe(true);
    expect(historyDeadlineExceeded(Date.now() + HISTORY_DEADLINE_MS)).toBe(
      false,
    );
  });

  it("maps bucket to latest round before bucket end", () => {
    const rounds = [
      { updatedAt: 100, answer: 100n },
      { updatedAt: 200, answer: 200n },
      { updatedAt: 300, answer: 300n },
    ];
    const pick = pickRoundForBucket(rounds, 150, 250);
    expect(pick?.updatedAt).toBe(200);
  });
});

describe("503 price path", () => {
  it("throws when fetch blocked", async () => {
    resetMarketDataCachesForTests();
    blockPriceFetchBriefly("usdc");
    await expect(getTokenMarketSnapshot("usdc")).rejects.toThrow(
      "Price data unavailable",
    );
    expect(mockedReadLatest).not.toHaveBeenCalled();
  });
});

describe("cNGN badge", () => {
  it("shows badge when gap exceeds default 2%", () => {
    const badge = computeCngnBadge({
      referencePrice: "1",
      cmcMarketPrice: "0.97",
      referenceFresh: true,
      cmcFresh: true,
    });
    expect(badge?.showBadge).toBe(true);
  });
});

describe("CMC budget guard", () => {
  it("caps daily calls from monthly budget and replicas", () => {
    process.env.MARKET_CMC_MONTHLY_BUDGET = "3000";
    process.env.MARKET_DATA_REPLICAS = "2";
    resetMarketDataCachesForTests();
    const max = maxCmcCallsPerDayPerInstance();
    expect(max).toBe(Math.floor(3000 / 30 / 2));
    for (let i = 0; i < max; i++) {
      expect(canSpendCmcCredit()).toBe(true);
      recordCmcCall();
    }
    expect(canSpendCmcCredit()).toBe(false);
    expect(getCmcCallsTodayForTests()).toBe(max);
  });
});

describe("CMC backoff", () => {
  it("blocks fetches for 60s on minute-limit code 1008", () => {
    resetMarketDataCachesForTests();
    applyCmcRateLimitBackoff(429, 1008);
    expect(isCmcInBackoff()).toBe(true);
    expect(getCmcBackoffUntilForTests()).toBeGreaterThan(Date.now());
  });
});

describe("history bucket cache", () => {
  it("fetches only missing buckets on a second request", async () => {
    mockedHistory.mockImplementation(
      async (_entry: unknown, timestamps: number[]) => {
        return timestamps.map((t: number) => ({
          t,
          answer: 99983000n,
          decimals: 8,
        }));
      },
    );

    await getTokenHistory("usdc", "1D");
    const firstCalls = mockedHistory.mock.calls.length;
    expect(firstCalls).toBeGreaterThan(0);

    mockedHistory.mockClear();
    await getTokenHistory("usdc", "1D");
    expect(mockedHistory.mock.calls.length).toBeLessThan(firstCalls);
  });
});

describe("service integration (mocked upstream)", () => {
  it("returns price and stats for USDC", async () => {
    mockedReadLatest.mockResolvedValue(mockRound());
    mockedReadAt.mockResolvedValue({
      answer: 99000000n,
      updatedAt: Math.floor(Date.now() / 1000) - 86400,
      decimals: 8,
      chain: "base",
      pairSlug: "usdc-usd",
      stale: false,
      marketClosed: false,
    });
    setCachedStats("usdc", {
      volume24h: "1000000",
      marketCap: "70000000000",
      circulatingSupply: "70000000000",
      totalSupply: "70000000000",
      marketCapMode: "reported",
      asOf: new Date().toISOString(),
      source: "coinmarketcap",
      stale: false,
    });

    const snap = await getTokenMarketSnapshot("usdc");
    expect(snap.price).toBe("0.99983");
    expect(snap.stats?.volume24h).toBe("1000000");
    expect(typeof snap.change24h.pct).toBe("string");
  });

  it("returns 503 path when price unavailable", async () => {
    mockedReadLatest.mockResolvedValue(null);
    await expect(getTokenMarketSnapshot("usdc")).rejects.toThrow(
      "Price data unavailable",
    );
  });

  it("marks history unavailable without zeros on failure", async () => {
    mockedHistory.mockResolvedValue([]);
    const hist = await getTokenHistory("usdc", "1D");
    expect(hist.unavailable).toBe(true);
    expect(hist.points).toEqual([]);
  });
});

describe("cache TTLs", () => {
  it("documents price and stats cache periods", () => {
    expect(CACHE_TTLS.priceMs).toBe(60_000);
    expect(CACHE_TTLS.statsMs).toBe(10 * 60_000);
  });
});

describe("money-safety boundary", () => {
  const FORBIDDEN_ROOTS = [
    join(__dirname, "../app/lib/payment-order-message-hash.ts"),
    join(__dirname, "../app/lib/bridge.ts"),
    join(__dirname, "../app/api/aggregator.ts"),
  ];

  function collectTsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const p = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...collectTsFiles(p));
      else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
    }
    return out;
  }

  const settlementPaths = [
    ...FORBIDDEN_ROOTS,
    ...collectTsFiles(join(__dirname, "../app/api/v1/payment-orders")),
  ];

  it("settlement and swap paths do not import market-data", () => {
    const needle = "market-data";
    for (const file of settlementPaths) {
      let st;
      try {
        st = statSync(file);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      const src = readFileSync(file, "utf8");
      expect(src.includes(needle)).toBe(false);
    }
  });
});

describe("env documentation", () => {
  it("does not expose market keys as NEXT_PUBLIC", () => {
    const example = readFileSync(join(__dirname, "../.env.example"), "utf8");
    expect(example).toContain("COINMARKETCAP_API_KEY=");
    expect(example).toContain("MARKET_DATA_RPC_KEY=");
    expect(example).not.toMatch(/NEXT_PUBLIC_COINMARKETCAP/);
    expect(example).not.toMatch(/NEXT_PUBLIC_MARKET_DATA/);
  });
});

describe("history route validation", () => {
  it("unknown token id fails registry before history fetch", async () => {
    expect(isValidMarketTokenId("unknown")).toBe(false);
    expect(mockedHistory).not.toHaveBeenCalled();
  });
});
