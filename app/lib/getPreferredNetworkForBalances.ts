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
    for (const tokenBalance of Object.values(entry.balances.balances || {})) {
      if (tokenBalance <= 0) continue;

      if (tokenBalance > highestTokenBalance) {
        highestTokenBalance = tokenBalance;
        preferredNetwork = entry.network;
        continue;
      }

      if (
        tokenBalance === highestTokenBalance &&
        entry.network.chain.name === currentNetworkName
      ) {
        preferredNetwork = entry.network;
      }
    }
  }

  return preferredNetwork;
}
