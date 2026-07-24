/**
 * Token symbol helpers for display vs aggregator wire format.
 *
 * UI / form state use `cNGN`. Aggregator rates and order APIs expect `CNGN`.
 */

/** Display form: `cNGN` for any cngn/CNGN/cNGN; otherwise pass-through. */
export function canonicalTokenSymbol(symbol: string | null | undefined): string {
  if (symbol == null) return "";
  const trimmed = symbol.trim();
  if (!trimmed) return "";
  if (trimmed.toLowerCase() === "cngn") return "cNGN";
  return trimmed;
}

/** Case-insensitive equality (cNGN === CNGN === cngn). */
export function tokensEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (a == null || b == null) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Aggregator wire form: `CNGN` when canonical is `cNGN`; else unchanged. */
export function toAggregatorToken(symbol: string | null | undefined): string {
  const canonical = canonicalTokenSymbol(symbol);
  if (!canonical) return "";
  if (canonical === "cNGN") return "CNGN";
  return canonical;
}
