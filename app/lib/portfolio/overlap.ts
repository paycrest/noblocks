/**
 * Earn ↔ wallet de-duplication for portfolio USD totals.
 *
 * Overlap key format (documented for KAN-961 AC #3):
 *   `${normalizeChain(chain)}:${canonicalSymbol}:${positionId}`
 *
 * Wallet token rows use positionId `wallet`. EVM-sourced earn (KAN-394) uses
 * `evm-earn-source` on the source chain while bridged funds may still appear
 * in the wallet balance — only that case excludes wallet USD from the tokens
 * bucket. Vesu positions already left the wallet; do not exclude wallet USD.
 */

import { canonicalTokenSymbol } from "@/app/lib/token-symbol";
import type { PortfolioBuildInputHolding } from "./types";
import { isZeroDecimalString } from "./money";

export function normalizePortfolioChain(chain: string): string {
  return chain.trim().toLowerCase().replace(/\s+/g, "-");
}

export function portfolioOverlapKey(
  chain: string,
  symbol: string,
  positionId: string,
): string {
  const canonical = canonicalTokenSymbol(symbol) ?? symbol.trim();
  const symKey = canonical.toLowerCase() === "cngn" ? "cNGN" : canonical.toUpperCase();
  return `${normalizePortfolioChain(chain)}:${symKey}:${positionId.trim().toLowerCase()}`;
}

/** Keys for wallet rows whose USD must be excluded from the tokens bucket. */
export function collectWalletUsdExclusionKeys(
  holdings: PortfolioBuildInputHolding[],
): Set<string> {
  const exclusions = new Set<string>();

  for (const h of holdings) {
    if (h.bucket !== "earn") continue;
    if (isZeroDecimalString(h.amount)) continue;
    if (h.positionId !== "evm-earn-source") continue;
    exclusions.add(portfolioOverlapKey(h.chain, h.symbol, "wallet"));
  }

  return exclusions;
}

export function shouldExcludeWalletHoldingFromUsd(
  holding: PortfolioBuildInputHolding,
  exclusions: Set<string>,
): boolean {
  if (holding.bucket !== "tokens" || holding.positionId !== "wallet") {
    return false;
  }
  const key = portfolioOverlapKey(
    holding.chain,
    holding.symbol,
    holding.positionId,
  );
  return exclusions.has(key);
}
