import "server-only";

import {
  buildPortfolioSummary,
  filterNonZeroHoldings,
} from "./builder";
import {
  getCachedPortfolioHoldings,
  getStalePortfolioHoldings,
  portfolioCacheKey,
  setCachedPortfolioHoldings,
} from "./cache.server";
import { fetchPortfolioHoldings } from "./fetch-holdings.server";
import { createMarketDataPriceLookup } from "./prices.server";
import type { PortfolioSummary } from "./types";
import type { PortfolioWalletContext } from "./wallet-context.server";

export async function buildPortfolioForWallet(
  ctx: PortfolioWalletContext,
): Promise<PortfolioSummary> {
  const key = portfolioCacheKey(ctx.evmBalanceAddress);
  const cachedFresh = getCachedPortfolioHoldings(key);

  if (cachedFresh) {
    const summary = await buildPortfolioSummary(
      cachedFresh.holdings,
      createMarketDataPriceLookup(),
    );
    return {
      ...summary,
      stale: summary.stale || cachedFresh.stale,
      asOf: cachedFresh.asOf,
    };
  }

  let holdings = filterNonZeroHoldings([]);
  let asOf = new Date().toISOString();
  let stale = false;

  try {
    const fetched = await fetchPortfolioHoldings(ctx);
    asOf = fetched.asOf;
    stale = fetched.stale;

    if (fetched.refreshFailed) {
      const prior = getStalePortfolioHoldings(key);
      if (prior) {
        holdings = prior.holdings;
        asOf = prior.asOf;
        stale = true;
      } else {
        holdings = filterNonZeroHoldings(fetched.holdings);
        stale = true;
      }
    } else {
      holdings = filterNonZeroHoldings(fetched.holdings);
      setCachedPortfolioHoldings(key, { holdings, asOf, stale });
    }
  } catch (error) {
    console.error("[portfolio] refresh failed, using last snapshot if any:", error);
    const prior = getStalePortfolioHoldings(key);
    if (prior) {
      holdings = prior.holdings;
      asOf = prior.asOf;
      stale = true;
    } else {
      stale = true;
    }
  }

  const summary = await buildPortfolioSummary(
    holdings,
    createMarketDataPriceLookup(),
  );

  return {
    ...summary,
    stale: summary.stale || stale,
    asOf,
  };
}
