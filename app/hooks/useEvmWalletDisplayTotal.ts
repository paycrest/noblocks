"use client";

import type { CrossChainBalanceEntry } from "../context";
import {
  parseEarnDepositedUsd,
  resolveEvmEarnWalletDisplayTotal,
} from "../lib/evmEarnWalletTotal";
import { isEvmEarnFlow } from "../lib/earnFeature";
import { useEarnSourcePosition } from "./useEarnSourcePosition";

/**
 * Selected-chain wallet total for Phase 2 EVM earn: liquid on-chain + Vesu
 * position sourced from that chain (localStorage).
 */
export function useEvmWalletDisplayTotal(params: {
  chainName: string;
  crossChainBalances: CrossChainBalanceEntry[];
  evmAddress?: string;
}): {
  liquidUsd: number;
  earnDepositedUsd: number;
  displayTotalUsd: number;
  includesEarn: boolean;
} {
  const { chainName, crossChainBalances, evmAddress } = params;
  const isEvmEarn = isEvmEarnFlow(chainName);
  const position = useEarnSourcePosition(
    isEvmEarn ? evmAddress : undefined,
    chainName,
    "USDC",
  );
  const earnDepositedUsd = isEvmEarn
    ? parseEarnDepositedUsd(position?.suppliedFormatted)
    : 0;

  const { liquidUsd, displayTotalUsd, includesEarn } =
    resolveEvmEarnWalletDisplayTotal({
      chainName,
      crossChainBalances,
      earnDepositedUsd,
    });

  return { liquidUsd, earnDepositedUsd, displayTotalUsd, includesEarn };
}
