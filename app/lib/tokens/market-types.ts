import type { TokenHistoryRange } from "./market-id";

export type ClientTokenMarketSnapshot = {
  id: string;
  price: string;
  change24h: { pct: string; abs: string } | null;
  asOf: string;
  stale: boolean;
  stats: {
    volume24h: string | null;
    marketCap: string | null;
    circulatingSupply: string | null;
  } | null;
};

export type ClientTokenHistoryResponse = {
  id: string;
  range: TokenHistoryRange;
  points: Array<[number, string]>;
  stale: boolean;
  unavailable?: boolean;
  partial?: boolean;
};
