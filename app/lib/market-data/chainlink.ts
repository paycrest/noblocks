import "server-only";

import {
  createPublicClient,
  http,
  parseAbi,
} from "viem";
import { base, arbitrum, celo } from "viem/chains";
import { getMarketDataRpcUrl } from "@/app/lib/server-config";
import {
  ASSET_REGISTRY,
  SEQUENCER_FEEDS,
  formatPriceSource,
  historyFeedFor,
} from "./assets";
import {
  answerToDecimalString,
  isFeedAnswerStale,
  isStablecoinBandOk,
  redactErrorMessage,
  validatePositiveAnswer,
} from "./validate";
import { logMarketDataWarning } from "./log";
import {
  HISTORY_DEADLINE_MS,
  resolveHistoryPoints,
  resetPhaseTableCacheForTests,
} from "./history-resolver";
import { evaluateSequencerStatus } from "./sequencer";
import type { AssetRegistryEntry, ChainlinkFeedConfig, ChainlinkRound, MarketChain } from "./types";
import type {
  HistoryReadOptions,
  HistoryReadResult,
  LatestPriceResult,
  PriceProvider,
} from "./provider";

const aggregatorAbi = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function getRoundData(uint80 roundId) view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() view returns (uint8)",
  "function description() view returns (string)",
]);

const bootVerified = new Set<string>();

function chainConfig(chain: MarketChain) {
  switch (chain) {
    case "base":
      return base;
    case "arbitrum":
      return arbitrum;
    case "celo":
      return celo;
    default:
      return base;
  }
}

const clientCache = new Map<
  MarketChain,
  ReturnType<typeof createPublicClient>
>();

export function getPublicClient(chain: MarketChain) {
  const existing = clientCache.get(chain);
  if (existing) return existing;

  const url = getMarketDataRpcUrl(chain);
  const client = createPublicClient({
    chain: chainConfig(chain),
    transport: http(url, { timeout: 5_000 }),
  });
  clientCache.set(
    chain,
    client as ReturnType<typeof createPublicClient>,
  );
  return client;
}

export function resetChainlinkClientsForTests(): void {
  clientCache.clear();
  bootVerified.clear();
  resetPhaseTableCacheForTests();
}

async function bootCheckFeed(feed: ChainlinkFeedConfig): Promise<boolean> {
  const key = `${feed.chain}:${feed.proxy}`;
  if (bootVerified.has(key)) return true;
  try {
    const client = getPublicClient(feed.chain);
    const [desc, dec] = await Promise.all([
      client.readContract({
        address: feed.proxy,
        abi: aggregatorAbi,
        functionName: "description",
      }),
      client.readContract({
        address: feed.proxy,
        abi: aggregatorAbi,
        functionName: "decimals",
      }),
    ]);
    if (desc.trim() !== feed.description.trim()) return false;
    if (Number(dec) !== feed.decimals) return false;
    bootVerified.add(key);
    return true;
  } catch (err) {
    logMarketDataWarning("feed_boot_check_failed", {
      chain: feed.chain,
      pair: feed.pairSlug,
      message: redactErrorMessage(err),
    });
    return false;
  }
}

async function sequencerUp(chain: "base" | "arbitrum"): Promise<boolean> {
  try {
    const client = getPublicClient(chain);
    const [block, round] = await Promise.all([
      client.getBlock({ blockTag: "latest" }),
      client.readContract({
        address: SEQUENCER_FEEDS[chain],
        abi: aggregatorAbi,
        functionName: "latestRoundData",
      }),
    ]);
    const [, answer, startedAt] = round;
    const status = evaluateSequencerStatus(
      answer,
      Number(startedAt),
      Number(block.timestamp),
    );
    if (status !== "up") {
      logMarketDataWarning("sequencer_not_operational", {
        chain,
        status,
      });
      return false;
    }
    return true;
  } catch (err) {
    logMarketDataWarning("sequencer_read_failed", {
      chain,
      message: redactErrorMessage(err),
    });
    return false;
  }
}

async function readFeedRound(
  feed: ChainlinkFeedConfig,
): Promise<ChainlinkRound | null> {
  const ok = await bootCheckFeed(feed);
  if (!ok) return null;

  if (feed.chain === "base" || feed.chain === "arbitrum") {
    const up = await sequencerUp(feed.chain);
    if (!up) {
      return null;
    }
  }

  try {
    const client = getPublicClient(feed.chain);
    const [, answer, , updatedAt] = await client.readContract({
      address: feed.proxy,
      abi: aggregatorAbi,
      functionName: "latestRoundData",
    });
    if (!validatePositiveAnswer(answer)) {
      logMarketDataWarning("feed_non_positive_answer", {
        chain: feed.chain,
        pair: feed.pairSlug,
      });
      return null;
    }
    const priceStr = answerToDecimalString(answer, feed.decimals);
    if (!isStablecoinBandOk(feed, priceStr)) {
      logMarketDataWarning("feed_stablecoin_band_reject", {
        chain: feed.chain,
        pair: feed.pairSlug,
      });
      return null;
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const { stale, marketClosed } = isFeedAnswerStale(
      feed,
      Number(updatedAt),
      nowSec,
    );
    return {
      answer,
      updatedAt: Number(updatedAt),
      decimals: feed.decimals,
      chain: feed.chain,
      pairSlug: feed.pairSlug,
      stale,
      marketClosed,
    };
  } catch (err) {
    logMarketDataWarning("chainlink_latest_read_failed", {
      chain: feed.chain,
      pair: feed.pairSlug,
      message: redactErrorMessage(err),
    });
    return null;
  }
}

async function readFeedAtBlock(
  feed: ChainlinkFeedConfig,
  blockNumber: bigint,
): Promise<ChainlinkRound | null> {
  const ok = await bootCheckFeed(feed);
  if (!ok) return null;
  try {
    const client = getPublicClient(feed.chain);
    const [, answer, , updatedAt] = await client.readContract({
      address: feed.proxy,
      abi: aggregatorAbi,
      functionName: "latestRoundData",
      blockNumber,
    });
    if (!validatePositiveAnswer(answer)) return null;
    const priceStr = answerToDecimalString(answer, feed.decimals);
    if (!isStablecoinBandOk(feed, priceStr)) return null;
    const nowSec = Math.floor(Date.now() / 1000);
    const { stale, marketClosed } = isFeedAnswerStale(
      feed,
      Number(updatedAt),
      nowSec,
    );
    return {
      answer,
      updatedAt: Number(updatedAt),
      decimals: feed.decimals,
      chain: feed.chain,
      pairSlug: feed.pairSlug,
      stale,
      marketClosed,
    };
  } catch {
    return null;
  }
}

export async function blockNumberForTimestamp(
  chain: MarketChain,
  targetSec: number,
): Promise<bigint | null> {
  const client = getPublicClient(chain);
  try {
    const latest = await client.getBlockNumber();
    const latestBlock = await client.getBlock({ blockNumber: latest });
    const latestTs = Number(latestBlock.timestamp);
    if (targetSec >= latestTs) return latest;

    const blockTimeSec =
      chain === "arbitrum" ? 1 : chain === "celo" ? 5 : 2;
    const delta = latestTs - targetSec;
    let guess =
      latest - BigInt(Math.max(0, Math.floor(delta / blockTimeSec)));
    const window = BigInt(5000);
    let lo = guess > window ? guess - window : BigInt(0);
    let hi = guess + window > latest ? latest : guess + window;
    while (lo < hi) {
      const mid = (lo + hi + BigInt(1)) / BigInt(2);
      const block = await client.getBlock({ blockNumber: mid });
      const ts = Number(block.timestamp);
      if (ts <= targetSec) lo = mid;
      else hi = mid - BigInt(1);
    }
    return lo;
  } catch {
    return null;
  }
}

async function readHistoryViaRounds(
  feed: ChainlinkFeedConfig,
  timestampsSec: number[],
  options?: HistoryReadOptions,
): Promise<HistoryReadResult> {
  if (timestampsSec.length === 0) {
    return { samples: [], partial: false };
  }
  const ok = await bootCheckFeed(feed);
  if (!ok) return { samples: [], partial: true };

  const stepSec = options?.stepSec ?? 3600;
  const rangeFromSec = options?.rangeFromSec ?? timestampsSec[0] ?? 0;
  const deadlineMs = options?.deadlineMs ?? HISTORY_DEADLINE_MS;

  try {
    const client = getPublicClient(feed.chain);
    const { samples: rows, partial, historyStartSec } =
      await resolveHistoryPoints(
        client,
        feed,
        timestampsSec,
        stepSec,
        rangeFromSec,
        deadlineMs,
      );

    const mapped = rows.map((row) => ({
      t: row.t,
      bucketStart: row.bucketStart,
      answer: row.answer,
      decimals: feed.decimals,
    }));

    if (partial) {
      logMarketDataWarning("history_partial_coverage", {
        chain: feed.chain,
        pair: feed.pairSlug,
        buckets: timestampsSec.length,
        filled: mapped.length,
        historyStartSec,
      });
    }

    return { samples: mapped, partial, historyStartSec };
  } catch (err) {
    logMarketDataWarning("history_sample_failed", {
      chain: feed.chain,
      pair: feed.pairSlug,
      message: redactErrorMessage(err),
    });
    return { samples: [], partial: true };
  }
}

function feedForAsset(entry: AssetRegistryEntry): ChainlinkFeedConfig {
  return entry.id === "cngn" ? entry.price : entry.price;
}

async function tryPrimaryThenFallback(
  entry: AssetRegistryEntry,
): Promise<{ round: ChainlinkRound; feed: ChainlinkFeedConfig } | null> {
  const primary = feedForAsset(entry);
  let round = await readFeedRound(primary);
  if (round) return { round, feed: primary };
  if (entry.fallback) {
    round = await readFeedRound(entry.fallback);
    if (round) return { round, feed: entry.fallback };
  }
  return null;
}

export const chainlinkPriceProvider: PriceProvider = {
  async readLatest(entry) {
    const result = await tryPrimaryThenFallback(entry);
    if (!result) return null;
    const derived = entry.id === "cngn";
    return { round: result.round, derived };
  },

  async readAt(entry, unixSec) {
    const feeds = [entry.price, entry.fallback].filter(
      Boolean,
    ) as ChainlinkFeedConfig[];
    for (const feed of feeds) {
      const block = await blockNumberForTimestamp(feed.chain, unixSec);
      if (!block) continue;
      const round = await readFeedAtBlock(feed, block);
      if (round) return round;
    }
    return null;
  },

  async readHistoryAtTimestamps(entry, timestampsSec, options) {
    return readHistoryViaRounds(historyFeedFor(entry), timestampsSec, options);
  },
};

export function roundToPriceString(round: ChainlinkRound): string {
  return answerToDecimalString(round.answer, round.decimals);
}

export function roundToSource(round: ChainlinkRound): string {
  return formatPriceSource(round.chain, round.pairSlug);
}

/** Ensures registry feeds boot-check at module warm (lazy per feed on first read). */
export function listConfiguredFeeds(): ChainlinkFeedConfig[] {
  const feeds: ChainlinkFeedConfig[] = [];
  for (const entry of Object.values(ASSET_REGISTRY)) {
    feeds.push(entry.price);
    if (entry.fallback) feeds.push(entry.fallback);
    if (entry.historyProxy) feeds.push(entry.historyProxy);
  }
  return feeds;
}
