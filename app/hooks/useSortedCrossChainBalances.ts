import { useMemo } from "react";
import type { CrossChainBalanceEntry } from "../context";

export function useSortedCrossChainBalances(
  crossChainBalances: CrossChainBalanceEntry[],
  selectedNetworkName: string,
) {
  return useMemo(() => {
    if (!crossChainBalances.length) return [];

    return [...crossChainBalances].sort((a, b) => {
      if (a.network.chain.name === selectedNetworkName) return -1;
      if (b.network.chain.name === selectedNetworkName) return 1;
      return a.network.chain.name.localeCompare(b.network.chain.name);
    });
  }, [crossChainBalances, selectedNetworkName]);
}
