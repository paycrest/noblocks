import { networks } from "@/app/mocks";
import type { Token } from "@/app/types";
import type { BridgeLeg, BridgeQuote } from "@/app/lib/bridge";
import { tokensEqual } from "@/app/lib/token-symbol";
import { formatTokenAmount } from "@/app/utils";

export const SWAP_COPY = {
  subtitle: "Swap tokens on any network",
  from: "From",
  to: "to",
  sell: "Sell",
  receive: "Receive",
  selectToken: "Select token",
  selectNetwork: "Select network",
  reviewCta: "Review swap",
  swapCta: "Swap",
  reviewTitle: "Review swap",
  youPay: "You pay",
  exchangeRate: "Exchange rate",
  receiveAtLeast: "Receive at least",
  fee: "Fee",
  fees: "Fees",
  warning:
    "Swaps cannot be reversed. Check the transaction details above before confirming.",
  successTitle: "Swap successful",
  completeTitle: "Swap Complete",
  transactionStatus: "Transaction status",
  completed: "Completed",
  fundStatus: "Fund status",
  swapped: "Swapped",
  timeSpent: "Time spent",
  transactionFee: "Transaction fee",
  date: "Date",
  viewInExplorer: "View in explorer",
  viewOnExplorer: "View on explorer",
  failedTitle: "Swap failed",
  failedMessage: "Please try again.",
  tryAgain: "Try again",
  close: "Close",
  done: "Done",
  pendingTitle: "Swapping your tokens...",
  pendingNote:
    "You can leave this screen, we will proceed to completing your swap",
  etaFallback: "Swap usually completes in 15 sec",
  noRail: "No swap route is available for this pair at this time.",
} as const;

/** Builds a same-network BridgeLeg from a chosen token symbol, mirroring
 * BridgeRouteSelector's buildTokenLeg — UI-level lookup only, no money logic. */
export function buildSwapLeg(
  networkName: string | null,
  symbol: string | null,
  allTokens: Record<string, Token[]>,
): BridgeLeg | null {
  if (!networkName || !symbol) return null;
  const network = networks.find((n) => n.chain.name === networkName);
  const token = (allTokens[networkName] ?? []).find((t) =>
    tokensEqual(t.symbol, symbol),
  );
  if (!network || !token) return null;
  return {
    network: network.chain.name,
    chainId: network.chain.id,
    token: token.symbol,
    tokenAddress: token.address,
    decimals: token.decimals,
    amount: "0",
    rawAmount: "0",
  };
}

/** Disables Review/Swap whenever there is no valid, current quote. No
 * min-amount or cNGN-rate logic — that is Convert-specific and does not
 * apply to this UI. */
export function canSubmitSwap(params: {
  from: BridgeLeg | null;
  to: BridgeLeg | null;
  parsedAmount: number;
  quote: BridgeQuote | null;
  quoteLoading: boolean;
  quoteError: unknown;
  isQuoteExpired: boolean;
  hasInsufficientBalance: boolean;
}): boolean {
  const {
    from,
    to,
    parsedAmount,
    quote,
    quoteLoading,
    quoteError,
    isQuoteExpired,
    hasInsufficientBalance,
  } = params;
  return (
    !!from &&
    !!to &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    !hasInsufficientBalance &&
    !isQuoteExpired &&
    !!quote &&
    !quoteLoading &&
    !quoteError
  );
}

/** True only when a quote attempt actually ran and came back with no route —
 * mirrors BridgeForm's noRailAvailable so an unauthenticated/not-ready query
 * (which also leaves quote null) isn't shown as a dead route. */
export function noSwapRailAvailable(params: {
  from: BridgeLeg | null;
  to: BridgeLeg | null;
  parsedAmount: number;
  quote: BridgeQuote | null;
  quoteFetched: boolean;
  quoteLoading: boolean;
  quoteError: unknown;
  hasInsufficientBalance: boolean;
}): boolean {
  const {
    from,
    to,
    parsedAmount,
    quote,
    quoteFetched,
    quoteLoading,
    quoteError,
    hasInsufficientBalance,
  } = params;
  return (
    !hasInsufficientBalance &&
    quoteFetched &&
    !quoteLoading &&
    !quoteError &&
    quote === null &&
    !!from &&
    !!to &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0
  );
}

/** "1 {from} ~ {rate} {to}" live-rate label for the footer / quote card. */
export function formatSwapRateLabel(
  fromSymbol: string | undefined,
  toSymbol: string | undefined,
  amountIn: string,
  amountOut: string,
): string | null {
  if (!fromSymbol || !toSymbol) return null;
  const inNum = parseFloat(amountIn);
  const outNum = parseFloat(amountOut);
  if (!Number.isFinite(inNum) || inNum <= 0 || !Number.isFinite(outNum)) {
    return null;
  }
  const rate = outNum / inNum;
  return `1 ${fromSymbol} ~ ${formatTokenAmount(rate)} ${toSymbol}`;
}
