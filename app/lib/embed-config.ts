import {
  parseCsvParam,
  parseEmbedNetworkConfig,
  type EmbedNetworkConfig,
} from "./embed-network";
import { canonicalTokenSymbol, tokensEqual } from "./token-symbol";

type SearchParamsLike = { get: (key: string) => string | null };

/**
 * Parse a CSV allowlist param.
 * - Key absent (`null`) → unrestricted (`null`)
 * - Key present → list (possibly empty); symbols canonicalized for tokens
 */
export function parseTokenAllowlist(
  raw: string | null,
): string[] | null {
  if (raw == null) return null;
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of parseCsvParam(raw)) {
    const symbol = canonicalTokenSymbol(part);
    if (!symbol) continue;
    const key = symbol.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(symbol);
  }
  return result;
}

export function parseCurrencyAllowlist(
  raw: string | null,
): string[] | null {
  if (raw == null) return null;
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of parseCsvParam(raw)) {
    const code = part.toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    result.push(code);
  }
  return result;
}

export function isTokenInAllowlist(
  token: string | null | undefined,
  allowlist: string[] | null,
): boolean {
  if (allowlist == null) return true;
  if (!token) return false;
  return allowlist.some((item) => tokensEqual(item, token));
}

export function isCurrencyInAllowlist(
  currency: string | null | undefined,
  allowlist: string[] | null,
): boolean {
  if (allowlist == null) return true;
  if (!currency) return false;
  const upper = currency.trim().toUpperCase();
  return allowlist.some((item) => item === upper);
}

export type HostSetConfigPayload = {
  network?: string;
  side?: string;
  token?: string;
  currency?: string;
};

export type EmbedParsedConfig = {
  tokenAllowlist: string[] | null;
  currencyAllowlist: string[] | null;
  networkConfig: EmbedNetworkConfig;
  /** Default token from `?token=` (canonicalized), if any. */
  defaultToken: string | null;
  /** Default currency from `?currency=`, if any. */
  defaultCurrency: string | null;
  hideSideToggle: boolean;
  /** True when URL/`set_config` fixed a buy/sell side. */
  sideLockedFromUrl: boolean;
  /** True to suppress the in-widget support chat (host provides its own). */
  hideSupport: boolean;
};

function parseBooleanFlag(raw: string | null): boolean {
  if (raw == null) return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function parseEmbedConfig(
  searchParams: SearchParamsLike,
): EmbedParsedConfig {
  const tokenAllowlist = parseTokenAllowlist(searchParams.get("tokens"));
  const currencyAllowlist = parseCurrencyAllowlist(
    searchParams.get("currencies"),
  );
  const networkConfig = parseEmbedNetworkConfig(searchParams);

  const tokenRaw = searchParams.get("token");
  const parsedToken =
    tokenRaw != null && tokenRaw.trim() !== ""
      ? canonicalTokenSymbol(tokenRaw)
      : null;

  const currencyRaw = searchParams.get("currency");
  const parsedCurrency =
    currencyRaw != null && currencyRaw.trim() !== ""
      ? currencyRaw.trim().toUpperCase()
      : null;

  const sideRaw = searchParams.get("side")?.trim().toLowerCase();
  const sideLockedFromUrl = sideRaw === "buy" || sideRaw === "sell";

  return {
    tokenAllowlist,
    currencyAllowlist,
    networkConfig,
    defaultToken:
      parsedToken && isTokenInAllowlist(parsedToken, tokenAllowlist)
        ? parsedToken
        : null,
    defaultCurrency:
      parsedCurrency &&
      isCurrencyInAllowlist(parsedCurrency, currencyAllowlist)
        ? parsedCurrency
        : null,
    hideSideToggle: parseBooleanFlag(searchParams.get("hideSideToggle")),
    sideLockedFromUrl,
    hideSupport: parseBooleanFlag(searchParams.get("hideSupport")),
  };
}
