import type { CrossChainBalanceEntry } from "../context";
import type { Network } from "../types";

/**
 * Returns the network that contains the highest-value positive token balance.
 * When token balances tie, the currently selected network is preferred to
 * avoid unnecessary switching.
 */
export function getPreferredNetworkForBalances(
  crossChainBalances: CrossChainBalanceEntry[],
  currentNetworkName?: string,
): Network | null {
  let preferredNetwork: Network | null = null;
  let highestTokenBalance = 0;

  for (const entry of crossChainBalances) {
    const highestBalanceForNetwork = Object.values(
      entry.balances.balances || {},
    ).reduce(
      (highestBalance, tokenBalance) =>
        tokenBalance > highestBalance ? tokenBalance : highestBalance,
      0,
    );

    if (highestBalanceForNetwork <= 0) continue;

    if (highestBalanceForNetwork > highestTokenBalance) {
      highestTokenBalance = highestBalanceForNetwork;
      preferredNetwork = entry.network;
      continue;
    }

    if (
      highestBalanceForNetwork === highestTokenBalance &&
      entry.network.chain.name === currentNetworkName
    ) {
      preferredNetwork = entry.network;
    }
  }

  return preferredNetwork;
}
