"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  usePrivy as usePrivyAuth,
  useLinkAccount as useLinkAccountAuth,
} from "@privy-io/react-auth";
import { useKYC, useInjectedWallet, useEmbed } from "../context";
import { KYC_TIERS } from "../context/KYCContext";
import { formatUsdAmount } from "../utils";

/** "$X / $Y" or "$X / Unlimited" for the Profile monthly-limit figure. */
export function formatMonthlyLimitLine(
  monthlySpent: number,
  monthlyLimit: number,
  unlimited: boolean,
): string {
  const spent = `$${formatUsdAmount(monthlySpent)}`;
  if (unlimited) return `${spent} / Unlimited`;
  return `${spent} / $${formatUsdAmount(monthlyLimit)}`;
}

/** Progress bar percent (0-100), clamped. Unlimited or a non-positive limit reads as 0. */
export function computeMonthlyProgressPercent(
  monthlySpent: number,
  monthlyLimit: number,
  unlimited: boolean,
): number {
  if (unlimited || monthlyLimit <= 0) return 0;
  return Math.min(100, Math.max(0, (monthlySpent / monthlyLimit) * 100));
}

/** "$X / month" or "Unlimited" for the accordion tier limit row. */
export function formatTierLimitLine(
  monthlyLimit: number,
  unlimited: boolean,
): string {
  return unlimited ? "Unlimited" : `$${formatUsdAmount(monthlyLimit)} / month`;
}

/** Bounded backoff for the quiet retry after a failed status/summary fetch. */
const RETRY_DELAYS_MS = [2000, 4000, 8000];

/** Account actions never wait more than this long on KYC status; the retry cycle keeps
 * running and real data fills in if status loads later. */
const ACCOUNT_ACTIONS_DEADLINE_MS = 10000;

/**
 * Shared Profile data/state: KYC tier, limits, account/email linking, and the
 * tier-accordion expand state. Consumed by both the drawer/sheet ProfileView
 * and the standalone Profile page so the KYC/Privy wiring lives in one place.
 */
export function useProfileViewModel() {
  const { user } = usePrivyAuth();
  const { isInjectedWallet, injectedAddress, injectedReady } = useInjectedWallet();
  const { isEmbed } = useEmbed();
  const {
    tier,
    pooledWalletCount,
    transactionSummary,
    hasLoadedStatus,
    hasLoadedTransactionSummary,
    getCurrentLimits,
    refreshStatus,
    walletAddress: kycWalletAddress,
  } = useKYC();

  // In injected/bridge mode, require a ready injected address; otherwise
  // use KYC context address.
  const walletAddress = isInjectedWallet
    ? (injectedReady ? injectedAddress : null)
    : kycWalletAddress;

  const [isLimitModalOpen, setIsLimitModalOpen] = useState(false);
  const [expandedTierLevel, setExpandedTierLevel] = useState<number | null>(null);
  const [isAddressCopied, setIsAddressCopied] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const [initialRefreshSettled, setInitialRefreshSettled] = useState(false);
  const [retriesExhausted, setRetriesExhausted] = useState(false);
  const retryCountRef = useRef(0);

  const currentLimits = getCurrentLimits();
  const monthlyLimit = currentLimits.monthly || 0;
  const monthlyProgress = computeMonthlyProgressPercent(
    transactionSummary.monthlySpent,
    monthlyLimit,
    !!currentLimits.unlimited,
  );

  // The page/drawer must keep showing the skeleton while status is unknown —
  // including after a failed fetch — rather than rendering the reset
  // snapshot (tier 0, $0.00 spend) as if it were real data. Once the retry
  // budget is exhausted, though, stop trapping the user on the skeleton —
  // the account card (address, copy, sign out) can render without KYC data.
  const isLoading = !hasLoadedStatus && !retriesExhausted;
  const isKycStatusLoading = !hasLoadedStatus;
  const isTransactionSummaryLoading = !hasLoadedTransactionSummary;

  // A new wallet gets its own full retry budget and its own initial-refresh gate — wallet A
  // exhausting its retries (or still having its initial refresh in flight) must not leave
  // wallet B with none, nor block B's retry effect from ever scheduling. The cancelled flag
  // means a completion from an earlier wallet can't settle the gate for the current one.
  // The deadline below is scoped to this wallet (cleared only on wallet change/unmount, not
  // when the initial refresh settles) — account actions never wait more than 10s on KYC
  // status, even if the initial refresh resolves quickly but the retry chained behind it
  // then hangs; the retry cycle keeps running and real data fills in if status loads later.
  useEffect(() => {
    let isMounted = true;
    retryCountRef.current = 0;
    setRetriesExhausted(false);
    setInitialRefreshSettled(false);
    const deadlineId = setTimeout(() => {
      if (isMounted) {
        setInitialRefreshSettled(true);
        setRetriesExhausted(true);
      }
    }, ACCOUNT_ACTIONS_DEADLINE_MS);
    void refreshStatus(true).finally(() => {
      if (isMounted) setInitialRefreshSettled(true);
    });
    return () => {
      isMounted = false;
      clearTimeout(deadlineId);
    };
  }, [walletAddress, refreshStatus]);

  // Quiet automatic retry: if status or the transaction summary failed to
  // load, retry a bounded number of times with backoff so a transient
  // failure doesn't leave the page on the skeleton forever. No new UI.
  // Waits for the initial refresh to settle first so it doesn't burn a
  // retry slot while that fetch is still in flight, and only counts a
  // retry once its timer actually fires (not merely scheduled).
  useEffect(() => {
    if (!initialRefreshSettled) return;
    if (hasLoadedStatus && hasLoadedTransactionSummary) {
      retryCountRef.current = 0;
      setRetriesExhausted(false);
      return;
    }
    if (retryCountRef.current >= RETRY_DELAYS_MS.length) {
      setRetriesExhausted(true);
      return;
    }
    const delay = RETRY_DELAYS_MS[retryCountRef.current];
    const timeoutId = setTimeout(() => {
      retryCountRef.current += 1;
      void refreshStatus(true).finally(() => setRetryTick((t) => t + 1));
    }, delay);
    return () => clearTimeout(timeoutId);
  }, [
    initialRefreshSettled,
    hasLoadedStatus,
    hasLoadedTransactionSummary,
    retryTick,
    refreshStatus,
    walletAddress,
  ]);

  const { linkEmail } = useLinkAccountAuth({
    onSuccess: ({ user }) => {
      toast.success(`${user.email?.address} linked successfully`);
    },
    onError: (error) => {
      // Privy reports why linking failed — surface the real reason instead of
      // blanket-claiming the email is already linked.
      const code = String(error);
      if (code === "exited_link_flow") return; // user closed the modal — not an error
      toast.error("Error linking account", {
        description:
          code === "linked_to_another_user"
            ? "This email is already linked to another account"
            : "Couldn't link your email. Please try again.",
      });
    },
  });

  const handleCopyAddress = async () => {
    if (!walletAddress) {
      setIsAddressCopied(false);
      return;
    }
    try {
      await navigator.clipboard.writeText(walletAddress);
      setIsAddressCopied(true);
      toast.success("Address copied to clipboard");
      setTimeout(() => setIsAddressCopied(false), 2000);
    } catch {
      setIsAddressCopied(false);
      toast.error("Could not copy address", {
        description: "Clipboard access was denied or is unavailable.",
      });
    }
  };

  const toggleTierExpansion = (tierLevel: number) => {
    setExpandedTierLevel((current) =>
      current === tierLevel ? null : tierLevel,
    );
  };

  useEffect(() => {
    if (tier < 1) {
      setExpandedTierLevel(tier + 1);
    }
  }, [tier]);

  const tiersAboveCurrent = Object.values(KYC_TIERS).filter(
    (tierData) => tierData.level > tier,
  );

  return {
    user,
    isInjectedWallet,
    isEmbed,
    walletAddress,
    tier,
    pooledWalletCount,
    transactionSummary,
    currentLimits,
    monthlyProgress,
    isLoading,
    isKycStatusLoading,
    isTransactionSummaryLoading,
    refreshStatus,
    linkEmail,
    handleCopyAddress,
    isAddressCopied,
    expandedTierLevel,
    toggleTierExpansion,
    tiersAboveCurrent,
    isLimitModalOpen,
    openLimitModal: () => setIsLimitModalOpen(true),
    closeLimitModal: () => setIsLimitModalOpen(false),
  };
}
