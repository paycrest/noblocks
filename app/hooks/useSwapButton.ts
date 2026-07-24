import { usePrivy } from "@privy-io/react-auth";
import { UseFormWatch } from "react-hook-form";
import { useInjectedWallet } from "../context";
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
  rate?: number | null;
  isSwapped?: boolean; // true when in onramp mode (fiat in Send, token in Receive)
  /** Selected chain name for on-ramp wallet validation (e.g. Base, Starknet). */
  networkName?: string;
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
  rate,
  isSwapped = false,
  networkName = "",
}: UseSwapButtonProps) {
  const { authenticated } = usePrivy();
  const { isInjectedWallet, injectedReady, injectedStatus } =
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
  // otherwise misread as "Insufficient balance".
  const isInjectedAwaiting =
    isInjectedWallet &&
    !injectedReady &&
    injectedStatus === "awaiting_connection";
  const isInjectedConnecting =
    isInjectedWallet && !injectedReady && injectedStatus === "pending";

  // Off-ramp: min 0.5 token. On-ramp: min fiat 0.5×rate only after receive token + rate (same as onrampFiatMin).
  const isAmountValid = isSwapped
    ? !token ||
      (Number(rate) > 0 && Number(amountSent) >= 0.5 * Number(rate))
    : Number(amountSent) >= 0.5;
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
