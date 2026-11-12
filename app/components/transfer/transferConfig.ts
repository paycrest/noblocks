"use client";

import { useEffect, useState } from "react";

import { fetchRate } from "@/app/api/aggregator";
import { bridgeFeeInReceivingToken, type BridgeQuote } from "@/app/lib/bridge";
import { toAggregatorToken } from "@/app/lib/token-symbol";
import type { RecipientDetailsWithId } from "@/app/types";
import {
  formatDecimalPrecision,
  formatRateForDisplay,
  formatTokenAmount,
  normalizeNetworkForRateFetch,
  shortenAddress,
} from "@/app/utils";

/** Copy for the Transfer flow. Strings match Figma frames 54/56/57. */
export const TRANSFER_COPY = {
  recipient: "Recipient",
  selectNetwork: "Select network",
  searchNetwork: "Search network",
  walletAddress: "Wallet address",
  amount: "Amount",
  max: "Max",
  selectToken: "Select token",
  searchToken: "Search token",
  continue: "Continue",
  swapTime: "Swap usually completes in 15 sec",
  confirmSubtitle: "Verify transaction details before you send",
  confirmTitle: (shortAddress: string) => `Confirm transfer to ${shortAddress}`,
  network: "Network",
  fees: "Fees",
  arrivalTime: "Arrival time",
  recipientRow: "Recipient",
  warning:
    "Transfers cannot be reversed. Check the transaction details above before confirming.",
  back: "Back",
  saveRecipient: "Save recipient to contacts",
  createBeneficiary: "Create beneficiary",
  beneficiaryName: "Name",
  beneficiaryNamePlaceholder: "Enter beneficiary name",
  beneficiaryAddress: "Address",
  beneficiaryNetwork: "Network",
  saveBeneficiary: "Save beneficiary",
  beneficiarySaved: "Recipient saved",
  pendingTitle: "Transferring your crypto...",
  pendingNote:
    "You can leave this screen, we will proceed to completing your transfer",
  successTitle: "Transfer successful",
  successBody: (amountLabel: string, shortAddress: string) =>
    `Your transfer of ${amountLabel} to ${shortAddress} has been completed successfully`,
  transactionStatus: "Transaction status",
  fundStatus: "Fund status",
  timeSpent: "Time spent",
  onchainReceipt: "Onchain receipt",
  completed: "Completed",
  transferred: "Transferred",
  viewInExplorer: "View in explorer",
  backHome: "Back home",
  newPayment: "New payment",
  helpSpreadTheWord: "Help spread the word",
  shareText: (
    amountLabel: string,
    tokenSymbol: string,
    shortAddress: string,
    seconds: number,
  ) =>
    `Yay! I just transferred ${amountLabel} ${tokenSymbol} to ${shortAddress} in ${seconds} sec on noblocks.xyz`,
} as const;

export const TRANSFER_QUICK_AMOUNTS = [10, 100, 500, 1000] as const;

export type TransferNetworkOption = {
  name: string;
  imageUrl: string;
};

const USD_STABLECOINS = new Set(["USDC", "USDT"]);

export function isUsdStablecoin(symbol: string | null | undefined): boolean {
  if (!symbol) return false;
  return USD_STABLECOINS.has(symbol.trim().toUpperCase());
}

const NON_EVM_RECIPIENT_NETWORKS = new Set(["starknet", "tron", "solana"]);

/** The saved-recipient API only accepts EVM wallet addresses. */
export function isEvmRecipientNetwork(
  networkName: string | null | undefined,
): boolean {
  if (!networkName) return false;
  return !NON_EVM_RECIPIENT_NETWORKS.has(networkName.trim().toLowerCase());
}

/** Figma short form: `0x7a3...91f4`. */
export function formatTransferShortAddress(address: string | undefined): string {
  if (!address) return "";
  return shortenAddress(address.trim(), 5, 4);
}

export function formatTransferTokenBalance(balance: number): string {
  if (!Number.isFinite(balance)) return "0";
  return String(formatDecimalPrecision(balance, 4));
}

export function formatTransferAmount(
  amount: number | string | undefined,
): string {
  if (amount == null || amount === "") return "0";
  return String(amount);
}

/**
 * USD display for the Select token rows. The form has no USD oracle, so only
 * USD-pegged stablecoins can be valued from their token balance.
 */
export function formatTransferTokenUsd(
  symbol: string,
  balance: number,
): string {
  if (!isUsdStablecoin(symbol) || !Number.isFinite(balance)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(balance);
}

/**
 * The only fee value the existing transfer path records is `fee: 0` in
 * `saveTransferTransaction` (useSmartWalletTransfer). The hook exposes no gas
 * estimate, so that is the fee shown on the confirm screen.
 */
export const TRANSFER_FEE_USD = 0;

/** `$0` / `$0.02` — up to two decimals, matching Figma. */
export function formatTransferFeeUsd(
  feeUsd: number | null | undefined,
): string {
  const value =
    typeof feeUsd === "number" && Number.isFinite(feeUsd)
      ? Math.max(0, feeUsd)
      : 0;
  return `$${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value)}`;
}

/** `Transfer $100` for USD stablecoins; token amount otherwise (no USD rate). */
export function formatTransferCtaLabel(  token: string,
  amount: number | string | undefined,
): string {
  if (!isUsdStablecoin(token)) {
    return `Transfer ${formatTransferAmount(amount)} ${token}`.trim();
  }
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return "Transfer $0";
  return `Transfer $${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numeric)}`;
}

const NGN_RATE_CURRENCY = "NGN";
const NGN_RATE_FALLBACK_NETWORK = "Base";

function parseRate(data: unknown): number | null {
  const numeric =
    typeof data === "number" ? data : typeof data === "string" ? Number(data) : NaN;
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return null;
}

/**
 * Display-only NGN quote for the form footer, same `sell` quote the Add funds
 * drawer already uses. Returns null when no rate is available.
 */
export function useTransferRate(
  token: string | undefined,
  chainName: string | undefined,
  enabled: boolean,
): string | null {
  const [rateLabel, setRateLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !token) {
      setRateLabel(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetchRate({
          token: toAggregatorToken(token),
          amount: 1,
          currency: NGN_RATE_CURRENCY,
          network: normalizeNetworkForRateFetch(
            chainName || NGN_RATE_FALLBACK_NETWORK,
          ),
          side: "sell",
          signal: controller.signal,
        });
        if (cancelled) return;
        const numeric = parseRate(response?.data);
        if (!numeric) {
          setRateLabel(null);
          return;
        }
        const formatted = formatRateForDisplay(numeric);
        setRateLabel(
          formatted
            ? `1 ${token} ~ ${formatted} ${NGN_RATE_CURRENCY}`
            : null,
        );
      } catch {
        if (!cancelled) setRateLabel(null);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [token, chainName, enabled]);

  return rateLabel;
}

/** Centered picker chrome: 361px wide, r32, pad 20/20/20/0, dark #2b2b2b. */
export const TRANSFER_PICKER_SHELL =
  "!rounded-[32px] !border !border-border-light !bg-white !px-5 !pb-0 !pt-5 !shadow-[0_2px_4px_-1px_rgba(18,18,23,0.06),0_4px_6px_-1px_rgba(18,18,23,0.08)] dark:!border-white/10 dark:!bg-[#2b2b2b]";

export const TRANSFER_MODAL_SCRIM =
  "fixed inset-0 bg-[#000]/50 backdrop-blur-[4px]";

export const TRANSFER_STACK_ICONS = [
  { src: "/deposit/network-stack-base.png", key: "base" },
  { src: "/deposit/network-stack-solana.svg", key: "solana" },
  { src: "/deposit/network-stack-ethereum.svg", key: "ethereum" },
] as const;

/**
 * Confirm-row arrival-time label for a fetched bridge quote. Only NEAR and
 * LI.FI quotes can occur for a genuinely cross-network pair (HyperFX/Textile
 * are same-chain-only — see `isHyperfxRoute`/`isTextileRoute` in
 * `app/lib/bridge.ts`), but every quote kind is handled for completeness.
 */
export function formatArrivalTime(quote: BridgeQuote | null | undefined): string | null {
  if (!quote) return null;
  if (quote.kind === "near-deposit") {
    return quote.timeEstimate || null;
  }
  if (quote.kind === "lifi-tx") {
    const seconds = parseInt(String(quote.estimate.executionDuration), 10);
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    return `~${Math.ceil(seconds / 60)} min`;
  }
  return null;
}

/** Confirm-row fee label for a fetched bridge quote, in the receiving token. */
export function formatBridgeFeeLabel(
  quote: BridgeQuote | null | undefined,
  receivingTokenSymbol: string,
): string | null {
  if (!quote) return null;
  const fee = bridgeFeeInReceivingToken(quote);
  if (!Number.isFinite(fee)) return null;
  return `${formatTokenAmount(fee)} ${receivingTokenSymbol}`.trim();
}

/**
 * True when `address` already matches a saved wallet-type recipient.
 * `RecipientDetails` has no network field for `type: "wallet"` (see
 * app/types.ts), so this is address-only, matching how `saveRecipient` itself
 * stores it. A missing/failed `savedRecipients` list resolves to "not saved"
 * so the UI keeps offering Save rather than hiding it on an unknown state.
 */
export function isAddressAlreadySaved(
  savedRecipients: RecipientDetailsWithId[] | null | undefined,
  address: string | null | undefined,
): boolean {
  if (!savedRecipients || !address) return false;
  const normalized = address.trim().toLowerCase();
  if (!normalized) return false;
  return savedRecipients.some(
    (recipient) =>
      recipient.type === "wallet" &&
      recipient.walletAddress.trim().toLowerCase() === normalized,
  );
}
