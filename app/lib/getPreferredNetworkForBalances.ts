import type { CrossChainBalanceEntry } from "../context";
import type { Network } from "../types";

/**
 * Returns the network with the highest positive total balance.
 * When totals tie, the currently selected network is preferred to avoid
 * unnecessary switching.
 */
export function getPreferredNetworkForBalances(
  crossChainBalances: CrossChainBalanceEntry[],
  currentNetworkName?: string,
): Network | null {
  let preferredEntry: CrossChainBalanceEntry | null = null;

  for (const entry of crossChainBalances) {
    const totalBalance = entry.balances.total ?? 0;

    if (totalBalance <= 0) continue;

    if (!preferredEntry || totalBalance > preferredEntry.balances.total) {
      preferredEntry = entry;
      continue;
    }

    if (
      totalBalance === preferredEntry.balances.total &&
      entry.network.chain.name === currentNetworkName
    ) {
      preferredEntry = entry;
    }
  }

  return preferredEntry?.network ?? null;
}
