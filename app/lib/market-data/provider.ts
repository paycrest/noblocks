import "server-only";

import type { AssetRegistryEntry, ChainlinkRound, TokenStatsBlock } from "./types";

export interface LatestPriceResult {
  round: ChainlinkRound;
  derived: boolean;
}

export interface HistoryReadOptions {
  deadlineMs?: number;
  stepSec?: number;
}

export interface PriceProvider {
  readLatest(entry: AssetRegistryEntry): Promise<LatestPriceResult | null>;
  readAt(entry: AssetRegistryEntry, unixSec: number): Promise<ChainlinkRound | null>;
  readHistoryAtTimestamps(
    entry: AssetRegistryEntry,
    timestampsSec: number[],
    options?: HistoryReadOptions,
  ): Promise<Array<{ t: number; answer: bigint; decimals: number }>>;
}

export interface StatsProvider {
  fetchAllStats(): Promise<Record<number, TokenStatsBlock> | null>;
}
