import "server-only";

export type MarketChain = "base" | "arbitrum" | "celo";

export type HistoryRange = "1D" | "1W" | "1M" | "1Y" | "ALL";

export type MarketCapMode = "reported" | "totalSupply";

export interface ChainlinkFeedConfig {
  chain: MarketChain;
  proxy: `0x${string}`;
  pairSlug: string;
  heartbeatS: number;
  description: string;
  decimals: number;
  /** Stablecoin sanity band [min, max] in USD; omit for non-stables. */
  stableBand?: [string, string];
  /** When true, staleness uses forex market-closed rules (NGN). */
  forexNgn?: boolean;
  inceptionUnix?: number;
}

export interface AssetRegistryEntry {
  id: string;
  symbol: string;
  name: string;
  cmcId: number;
  price: ChainlinkFeedConfig;
  fallback?: ChainlinkFeedConfig;
  /** Chart history proxy when it differs from live `price` (e.g. ETH SVR vs full-phase feed). */
  historyProxy?: ChainlinkFeedConfig;
  marketCapMode?: MarketCapMode;
}

export interface TokenStatsBlock {
  volume24h: string | null;
  marketCap: string | null;
  circulatingSupply: string | null;
  totalSupply: string | null;
  marketCapMode: MarketCapMode;
  asOf: string;
  source: "coinmarketcap";
  stale: boolean;
}

export interface CngnExtras {
  referenceLabel: string;
  marketPrice: string;
  gapPct: string;
  showBadge: boolean;
}

export interface TokenMarketSnapshot {
  id: string;
  price: string;
  change24h: { pct: string; abs: string };
  asOf: string;
  source: string;
  derived: boolean;
  stale: boolean;
  marketClosed: boolean;
  stats: TokenStatsBlock | null;
  cngn?: CngnExtras;
}

export interface TokenHistoryResponse {
  id: string;
  range: HistoryRange;
  points: Array<[number, string]>;
  from: number;
  asOf: string;
  stale: boolean;
  partial?: boolean;
  unavailable?: boolean;
  /** First on-chain round timestamp available for this chart (unix seconds). */
  historyStart?: number;
}

export interface ChainlinkRound {
  answer: bigint;
  updatedAt: number;
  decimals: number;
  chain: MarketChain;
  pairSlug: string;
  stale: boolean;
  marketClosed: boolean;
}
