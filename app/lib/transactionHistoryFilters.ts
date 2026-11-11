import type { TransactionHistoryType, TransactionStatus } from "../types";

export const HISTORY_TRANSACTION_TYPES: readonly TransactionHistoryType[] = [
  "onramp",
  "offramp",
  "transfer",
  "swap",
  "credit",
  "bridge",
];

export const HISTORY_TRANSACTION_STATUSES: readonly TransactionStatus[] = [
  "completed",
  "pending",
  "processing",
  "fulfilled",
  "fulfilling",
  "refunding",
  "refunded",
  "failed",
  "expired",
];

export const HISTORY_FILTER_CHIPS = [
  "All",
  "Swaps",
  "Sends",
  "Receives",
  "Earn",
] as const;
export type HistoryFilterChip = (typeof HISTORY_FILTER_CHIPS)[number];

/**
 * Chip -> backing transaction types. Earn has no backing transaction type in
 * the transactions table, so it maps to `null`: selecting it must never call
 * the API — the UI shows the filtered-empty state directly.
 */
export const HISTORY_FILTER_TYPES: Record<
  HistoryFilterChip,
  TransactionHistoryType[] | null
> = {
  All: [],
  Swaps: ["onramp", "offramp", "swap", "bridge"],
  Sends: ["transfer"],
  Receives: ["credit"],
  Earn: null,
};

export interface HistoryStatusOption {
  label: string;
  statuses: TransactionStatus[];
}

export const HISTORY_STATUS_OPTIONS: readonly HistoryStatusOption[] = [
  { label: "All statuses", statuses: [] },
  { label: "Completed", statuses: ["completed"] },
  {
    label: "Pending",
    statuses: ["pending", "processing", "fulfilling", "fulfilled"],
  },
  { label: "Failed", statuses: ["failed"] },
  { label: "Refunded", statuses: ["refunding", "refunded"] },
  { label: "Expired", statuses: ["expired"] },
];

export interface HistoryQueryParamsLike {
  get(name: string): string | null;
}

export interface ParsedHistoryQuery {
  page: number;
  limit: number;
  types: TransactionHistoryType[];
  statuses: TransactionStatus[];
  search: string;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_SEARCH_LENGTH = 64;

function parseIntOrFallback(raw: string | null, fallback: number): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseCommaList<T extends string>(
  raw: string | null,
  whitelist: readonly T[],
): T[] {
  if (!raw) return [];
  const allowed = new Set<string>(whitelist);
  const seen = new Set<T>();
  for (const value of raw.split(",")) {
    const trimmed = value.trim();
    if (allowed.has(trimmed)) seen.add(trimmed as T);
  }
  return Array.from(seen);
}

/** Strips everything but letters/digits and caps length, so it's safe to embed in an `.ilike` filter. */
export function sanitizeHistorySearch(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/[^A-Za-z0-9]/g, "").slice(0, MAX_SEARCH_LENGTH);
}

/** Pure query parser shared by the API route — kept here so it's unit-testable without a request object. */
export function parseHistoryQuery(
  searchParams: HistoryQueryParamsLike,
): ParsedHistoryQuery {
  let page = parseIntOrFallback(searchParams.get("page"), DEFAULT_PAGE);
  if (!Number.isInteger(page) || page < 1) page = DEFAULT_PAGE;

  let limit = parseIntOrFallback(searchParams.get("limit"), DEFAULT_LIMIT);
  if (!Number.isInteger(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  const types = parseCommaList(
    searchParams.get("types"),
    HISTORY_TRANSACTION_TYPES,
  );
  const statuses = parseCommaList(
    searchParams.get("statuses"),
    HISTORY_TRANSACTION_STATUSES,
  );
  const search = sanitizeHistorySearch(searchParams.get("search"));

  return { page, limit, types, statuses, search };
}

/** List/detail fiat amount with its currency code prefix, e.g. "NGN 369,723.88". */
export function formatFiatWithCode(code: string, amount: number): string {
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${code} ${formatted}`;
}

/** List/detail crypto amount with its token symbol, at least 2 decimals, e.g. "28.10 USDC". */
export function formatCryptoWithSymbol(amount: number, symbol: string): string {
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(amount);
  return `${formatted} ${symbol}`;
}

/** Row / detail time, e.g. "4:14 AM". */
export function formatHistoryTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/** Details panel date/time, e.g. "4:14 AM  13 May 2024" (two spaces between time and date). */
export function formatHistoryDateTime(date: Date): string {
  const datePart = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
  return `${formatHistoryTime(date)}  ${datePart}`;
}

/** Stable cache-key fragment for a filters object (order-independent, omits empty values). */
export interface TransactionHistoryFilters {
  types?: TransactionHistoryType[];
  statuses?: TransactionStatus[];
  search?: string;
}

export function serializeHistoryFilters(
  filters: TransactionHistoryFilters | undefined,
): string {
  if (!filters) return "";
  const types = filters.types?.length ? [...filters.types].sort() : [];
  const statuses = filters.statuses?.length
    ? [...filters.statuses].sort()
    : [];
  const search = filters.search?.trim() ?? "";
  if (types.length === 0 && statuses.length === 0 && !search) return "";
  return JSON.stringify({ types, statuses, search });
}
