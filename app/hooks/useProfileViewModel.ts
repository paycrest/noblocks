"use client";
import { useEffect, useState } from "react";
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
  const [isLoading, setIsLoading] = useState(false);

  const currentLimits = getCurrentLimits();
  const monthlyLimit = currentLimits.monthly || 0;
  const monthlyProgress = computeMonthlyProgressPercent(
    transactionSummary.monthlySpent,
    monthlyLimit,
    !!currentLimits.unlimited,
  );

  useEffect(() => {
    setIsLoading(true);
    refreshStatus(true).finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
