import "server-only";

import type { AssetRegistryEntry, ChainlinkRound, TokenStatsBlock } from "./types";

export interface LatestPriceResult {
  round: ChainlinkRound;
  derived: boolean;
}

export interface HistoryReadOptions {
  deadlineMs?: number;
  stepSec?: number;
  rangeFromSec?: number;
  /** When true (All range), anchor sampling at phase-1 round 1. */
  useFeedInception?: boolean;
}

export interface HistoryReadResult {
  samples: Array<{ t: number; answer: bigint; decimals: number }>;
  partial: boolean;
  historyStartSec?: number;
}

export interface PriceProvider {
  readLatest(entry: AssetRegistryEntry): Promise<LatestPriceResult | null>;
  readAt(entry: AssetRegistryEntry, unixSec: number): Promise<ChainlinkRound | null>;
  readHistoryAtTimestamps(
    entry: AssetRegistryEntry,
    timestampsSec: number[],
    options?: HistoryReadOptions,
  ): Promise<HistoryReadResult>;
}

export interface StatsProvider {
  fetchAllStats(): Promise<Record<number, TokenStatsBlock> | null>;
}
