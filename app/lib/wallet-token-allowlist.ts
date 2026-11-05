import { FALLBACK_TOKENS } from "@/app/utils";
import { canonicalTokenSymbol, tokensEqual } from "./token-symbol";

function buildAllowlistSymbols(): Set<string> {
  const set = new Set<string>();
  for (const networkTokens of Object.values(FALLBACK_TOKENS)) {
    for (const token of networkTokens) {
      const canonical = canonicalTokenSymbol(token.symbol);
      if (canonical) set.add(canonical);
    }
  }
  return set;
}

let cachedAllowlist: Set<string> | null = null;

function getAllowlistSymbols(): Set<string> {
  if (!cachedAllowlist) {
    cachedAllowlist = buildAllowlistSymbols();
  }
  return cachedAllowlist;
}

/** Validates dynamic `[symbol]` segments against supported token symbols. */
export function isAllowedWalletTokenSymbol(raw: string): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return false;
  }
  const canonical = canonicalTokenSymbol(decoded);
  if (!canonical) return false;
  for (const allowed of getAllowlistSymbols()) {
    if (tokensEqual(allowed, canonical)) return true;
  }
  return false;
}

export function resolveWalletTokenMeta(raw: string): {
  symbol: string;
  name: string;
} | null {
  if (!isAllowedWalletTokenSymbol(raw)) return null;
  const canonical = canonicalTokenSymbol(decodeURIComponent(raw));
  for (const networkTokens of Object.values(FALLBACK_TOKENS)) {
    const match = networkTokens.find((t) => tokensEqual(t.symbol, canonical));
    if (match) {
      return { symbol: canonicalTokenSymbol(match.symbol), name: match.name };
    }
  }
  return { symbol: canonical, name: canonical };
}
