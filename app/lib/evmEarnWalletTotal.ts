import type { CrossChainBalanceEntry } from "../context";
import { isEvmEarnFlow } from "./earnFeature";

/** On-chain USD total for a single EVM network entry. */
export function selectedChainLiquidUsd(
  crossChainBalances: CrossChainBalanceEntry[],
  chainName: string,
): number {
  const entry = crossChainBalances.find(
    (e) => e.network.chain.name === chainName,
  );
  const total = entry?.balances.total;
  return typeof total === "number" && Number.isFinite(total) ? total : 0;
}

/** Sum liquid USD across all cross-chain balance entries. */
export function sumAllChainLiquidUsd(
  crossChainBalances: CrossChainBalanceEntry[],
): number {
  return crossChainBalances.reduce((sum, entry) => {
    const total = entry.balances.total;
    return sum + (typeof total === "number" && Number.isFinite(total) ? total : 0);
  }, 0);
}

export function parseEarnDepositedUsd(
  suppliedFormatted?: string | null,
): number {
  if (!suppliedFormatted) return 0;
  const parsed = parseFloat(suppliedFormatted);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function evmWalletDisplayTotalUsd(
  liquidUsd: number,
  earnDepositedUsd: number,
): number {
  const total = liquidUsd + earnDepositedUsd;
  return Number.isFinite(total) ? total : liquidUsd;
}

export function resolveEvmEarnWalletDisplayTotal(params: {
  chainName: string;
  crossChainBalances: CrossChainBalanceEntry[];
  earnDepositedUsd: number;
}): { liquidUsd: number; displayTotalUsd: number; includesEarn: boolean } {
  const includesEarn = isEvmEarnFlow(params.chainName);
  const liquidUsd = sumAllChainLiquidUsd(params.crossChainBalances);
  const displayTotalUsd = includesEarn
    ? evmWalletDisplayTotalUsd(liquidUsd, params.earnDepositedUsd)
    : liquidUsd;
  return { liquidUsd, displayTotalUsd, includesEarn };
}
