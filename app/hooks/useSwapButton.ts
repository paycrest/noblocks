import { usePrivy } from "@privy-io/react-auth";
import { UseFormWatch } from "react-hook-form";
import { useInjectedWallet } from "../context";
import type { LiquiditySegment } from "../lib/marketLiquidity";
import { validateWalletAddress } from "../lib/validation";

/** Primary CTA when limits require upgrading verification (opens limit / KYC flow from swap). */
function labelForNextTierVerification(tier: number): string {
  if (tier >= 3) return "Verify to continue";
  if (tier === 2) return "Verify address for higher limits";
  if (tier === 1) return "Verify ID for higher limits";
  return "Verify phone for higher limits";
}

interface UseSwapButtonProps {
  watch: UseFormWatch<any>;
  balance?: number;
  isDirty: boolean;
  isValid: boolean;
  isUserVerified: boolean;
  /** Wallets that already have Noblocks activity show "Swap" (phone verification still opens on tap); new users keep "Get started". */
  hasPriorTransactionActivity?: boolean;
  /** After phone OTP, CTA should name the next verification step (ID / address), not generic "raise limit". */
  isPhoneVerified?: boolean;
  /** Current KYC tier (0–3); used when phone is done but swap is blocked by limits. */
  kycTier?: number;
  /**
   * Whether a KYC status fetch has actually succeeded for the current wallet. Until it has, the
   * tier/phone values below are the reset defaults, which read identically to "unverified" — so
   * a verified user whose status hasn't loaded (e.g. the injected SIWE session lapsed) would be
   * sent back to phone verification. Defaults to true so callers without KYC keep their behavior.
   */
  hasLoadedStatus?: boolean;
  rate?: number | null;
  isSwapped?: boolean; // true when in onramp mode (fiat in Send, token in Receive)
  /** Selected chain name for on-ramp wallet validation (e.g. Base, Starknet). */
  networkName?: string;
  /**
   * Live fillable range in Send-field units (fiat on onramp, token on offramp).
   * Null bounds mean unknown, which keeps the pre-existing limits in force.
   */
  liquidity?: {
    min: number | null;
    max: number | null;
    /** Fillable runs within [min, max]; absent means unknown, so not enforced. */
    segments?: LiquiditySegment[];
    noLiquidity: boolean;
  };
}

/** Unknown segments must not block, so an absent list passes. */
function fitsLiquiditySegment(
  segments: LiquiditySegment[] | undefined,
  amount: number,
): boolean {
  if (!segments?.length) return true;
  return segments.some(
    (segment) => amount >= segment.min && amount <= segment.max,
  );
}

export function useSwapButton({
  watch,
  balance = 0,
  isDirty,
  isValid,
  isUserVerified,
  hasPriorTransactionActivity = false,
  isPhoneVerified = false,
  kycTier = 0,
  hasLoadedStatus = true,
  rate,
  isSwapped = false,
  networkName = "",
  liquidity,
}: UseSwapButtonProps) {
  const { authenticated } = usePrivy();
  const { isInjectedWallet, injectedReady, injectedRequested, injectedStatus } =
    useInjectedWallet();
  const {
    amountSent,
    currency,
    recipientName,
    walletAddress,
    receiveDestinationExplicitlySelected,
    token,
  } = watch();

  // Injected mode with no account yet: the CTA becomes "Connect wallet"
  // (enabled even on an empty form) and everything balance/KYC-related below
  // must not run — a disconnected wallet's balance is 0, which would
  // otherwise misread as "Insufficient balance". Anchored on injectedRequested
  // (synchronous, from the URL) rather than isInjectedWallet: during bridge
  // initialization the status is "pending" before isInjectedWallet flips true,
  // and the CTA must not route to Privy login in that window.
  const isInjectedAwaiting =
    injectedRequested &&
    !injectedReady &&
    injectedStatus === "awaiting_connection";
  const isInjectedConnecting =
    injectedRequested && !injectedReady && injectedStatus === "pending";

  // The amount must clear a static floor and, when live provider capacity is
  // known, sit within what a single provider will actually fill:
  //   - floor: 0.5 token off-ramp; 0.5×rate in fiat on-ramp, and only once a
  //     receive token and rate exist (same condition as onrampFiatMin)
  //   - live band: raises that floor and caps the ceiling, and rejects a hole
  //     between two providers' bands (see LiquidityEnvelope.segments)
  // Unknown liquidity leaves the static floor in force on its own, so the CTA
  // agrees with the amount field rather than letting an unfillable amount past.
  const liquidityFloor = liquidity?.min ?? 0;
  const liquidityCeiling = liquidity?.max ?? Infinity;
  const withinLiquidity =
    !liquidity?.noLiquidity &&
    Number(amountSent) <= liquidityCeiling &&
    fitsLiquiditySegment(liquidity?.segments, Number(amountSent));
  const isAmountValid = isSwapped
    ? !token ||
      (withinLiquidity &&
        Number(rate) > 0 &&
        Number(amountSent) >= Math.max(0.5 * Number(rate), liquidityFloor))
    : withinLiquidity && Number(amountSent) >= Math.max(0.5, liquidityFloor);
  const isCurrencySelected = Boolean(currency);

  const totalRequired = Number(amountSent) || 0;

  // Skip balance check in onramp mode (isSwapped = true)
  const hasInsufficientBalance = isSwapped ? false : totalRequired > balance;

  // Check recipient based on mode: valid walletAddress for onramp, recipientName for offramp
  const hasRecipient = isSwapped
    ? (() => {
        const addr = String(walletAddress ?? "").trim();
        if (!addr || !networkName) return false;
        return validateWalletAddress(addr, networkName) === true;
      })()
    : Boolean(recipientName);

  const isEnabled = (() => {
    // Connecting needs no amount: the CTA is live as soon as the form renders.
    if (isInjectedAwaiting) return true;
    if (isInjectedConnecting) return false;

    // Phone / next-tier KYC from the main CTA must work before the user picks a
    // recipient; otherwise the verify label appears on a permanently disabled button.
    const rateReady = Boolean(rate) && Number(rate) > 0;
    if (
      !isUserVerified &&
      (authenticated || isInjectedWallet) &&
      Number(amountSent) > 0 &&
      isCurrencySelected &&
      isAmountValid &&
      rateReady
    ) {
      return true;
    }

    if (!receiveDestinationExplicitlySelected) return false;
    if (!rate) return false;
    if (isInjectedWallet && hasInsufficientBalance) {
      return false;
    }

    if (hasInsufficientBalance && !isInjectedWallet && authenticated) {
      return true;
    }

    if (!isCurrencySelected || !isAmountValid) {
      return false;
    }

    // On-ramp: walletAddress registers inside RecipientDetailsForm, so form-wide
    // isValid can stay false until late validation; gate on recipient + amounts.
    if (isSwapped) {
      if (!authenticated && !isInjectedWallet) {
        return true;
      }
      return hasRecipient;
    }

    if (isInjectedWallet) {
      if (!isValid) {
        return false;
      }
      return hasRecipient;
    }

    if (!isValid) {
      return false;
    }

    if (!authenticated && !isInjectedWallet) {
      return true; // Enable for login if amount and currency are valid
    }

    return hasRecipient;
  })();

  const buttonText = (() => {
    if (isInjectedAwaiting) return "Connect wallet";
    if (isInjectedConnecting) return "Connecting...";

    if (isInjectedWallet && hasInsufficientBalance) {
      return "Insufficient balance";
    }

    if (authenticated && hasInsufficientBalance && !isInjectedWallet) {
      return "Fund wallet";
    }

    if (
      !isUserVerified &&
      (authenticated || isInjectedWallet) &&
      amountSent > 0
    ) {
      // Status not loaded yet: unknown, not unverified. Naming a verification step here would
      // greet a returning verified user as a newcomer; handleSwap resolves the real status.
      if (!hasLoadedStatus) {
        return "Swap";
      }
      // Not on Tier 1 yet: start phone verification (not "Increase limit").
      if (kycTier < 1 || !isPhoneVerified) {
        // Existing wallets show "Swap" (tapping still opens phone verification);
        // brand-new users get "Get started".
        return hasPriorTransactionActivity ? "Swap" : "Get started";
      }
      // Max tier reached: there's no higher verification to do, so default to "Swap"
      // (never "Verify to continue"). Any limit is enforced at order creation.
      if (kycTier >= 3) {
        return "Swap";
      }
      return labelForNextTierVerification(kycTier);
    }

    return "Swap";
  })();

  const buttonAction = (
    handleSwap: () => void,
    login: () => void,
    handleFundWallet: () => void,
    openPhoneVerification: () => void,
    openLimitModal: () => void,
    isPhoneVerified: boolean,
    isUserVerified: boolean,
    connectWallet?: () => void,
  ) => {
    if ((isInjectedAwaiting || isInjectedConnecting) && connectWallet) {
      return connectWallet;
    }
    if (!authenticated && !isInjectedWallet) {
      return login;
    }
    if (hasInsufficientBalance && !isInjectedWallet && authenticated) {
      return handleFundWallet;
    }
    if (!hasInsufficientBalance && !isUserVerified && (authenticated || isInjectedWallet)) {
      // Status unknown (never loaded for this wallet): defer to handleSwap, which refreshes —
      // re-establishing the injected session if needed — before choosing a verification step.
      // Opening the phone modal from here would bypass that refresh entirely.
      if (!hasLoadedStatus) {
        return handleSwap;
      }
      // Tier 1 onboarding: phone modal. Active tier at cap: limit or ID/address upgrade.
      if (kycTier < 1 || !isPhoneVerified) {
        return openPhoneVerification;
      }
      // Max tier reached: nothing left to verify — proceed to swap (limit enforced on submit).
      if (kycTier >= 3) {
        return handleSwap;
      }
      return openLimitModal;
    }
    return handleSwap;
  };

  return {
    isEnabled,
    buttonText,
    buttonAction,
    hasInsufficientBalance,
  };
}
