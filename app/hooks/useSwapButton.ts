import { usePrivy } from "@privy-io/react-auth";
import { UseFormWatch } from "react-hook-form";
import { useInjectedWallet } from "../context";
import { calculateSenderFee } from "../utils";

const MIGRATION_DEADLINE = new Date("2026-03-01T00:00:00Z");

interface UseSwapButtonProps {
  watch: UseFormWatch<any>;
  balance?: number;
  isDirty: boolean;
  isValid: boolean;
  isUserVerified: boolean;
  rate?: number | null;
  tokenDecimals?: number;
  isSwapped?: boolean; // true when in onramp mode (fiat in Send, token in Receive)
  needsMigration?: boolean;
  isRemainingFundsMigration?: boolean;
}

export function useSwapButton({
  watch,
  balance = 0,
  isDirty,
  isValid,
  isUserVerified,
  rate,
  tokenDecimals = 18,
  isSwapped = false,
  needsMigration = false,
  isRemainingFundsMigration = false,
}: UseSwapButtonProps) {
  const { authenticated } = usePrivy();
  const { isInjectedWallet } = useInjectedWallet();
  const {
    amountSent,
    currency,
    recipientName,
    walletAddress,
    receiveDestinationExplicitlySelected,
    token,
  } = watch();

  // Off-ramp: min 0.5 token. On-ramp: min fiat 0.5×rate only after receive token + rate (same as onrampFiatMin).
  const isAmountValid = isSwapped
    ? !token ||
      (Number(rate) > 0 && Number(amountSent) >= 0.5 * Number(rate))
    : Number(amountSent) >= 0.5;
  const isCurrencySelected = Boolean(currency);

  const isMigrationMandatory =
    needsMigration && !isRemainingFundsMigration && new Date() >= MIGRATION_DEADLINE;

  // Calculate sender fee and include in balance check
  const { feeAmount: senderFeeAmount } = calculateSenderFee(
    Number(amountSent) || 0,
    rate || 0,
    tokenDecimals,
  );
  const totalRequired = (Number(amountSent) || 0) + senderFeeAmount;

  // Skip balance check in onramp mode (isSwapped = true)
  const hasInsufficientBalance = isSwapped ? false : totalRequired > balance;

  // Check recipient based on mode: walletAddress for onramp, recipientName for offramp
  const hasRecipient = isSwapped ? Boolean(walletAddress) : Boolean(recipientName);

  const isEnabled = (() => {
    if (needsMigration && authenticated && !isInjectedWallet) return true;
    if (isMigrationMandatory) return true;
    if (!receiveDestinationExplicitlySelected) return false;
    if (!rate) return false;
    if (isInjectedWallet && hasInsufficientBalance) {
      return false;
    }

    if (hasInsufficientBalance && !isInjectedWallet && authenticated) {
      return true;
    }

    if (
      !isUserVerified &&
      (authenticated || isInjectedWallet) &&
      amountSent > 0 &&
      isCurrencySelected &&
      isAmountValid &&
      isDirty
    ) {
      return true;
    }

    if (isInjectedWallet) {
      if (!isDirty || !isValid || !isCurrencySelected || !isAmountValid) {
        return false;
      }
      return hasRecipient;
    }

    if (!isDirty || !isValid || !isCurrencySelected || !isAmountValid) {
      return false;
    }

    if (!authenticated && !isInjectedWallet) {
      return true; // Enable for login if amount and currency are valid
    }

    return hasRecipient; // Check walletAddress for onramp, recipientName for offramp
  })();

  const buttonText = (() => {
    if (needsMigration && authenticated && !isInjectedWallet) {
      return "Swap";
    }

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
      return "Get started";
    }

    return "Swap";
  })();

  const buttonAction = (
    handleSwap: () => void,
    login: () => void,
    handleFundWallet: () => void,
    setIsKycModalOpen: () => void,
    isUserVerified: boolean,
    openMigrationModal?: () => void,
  ) => {
    if (needsMigration && authenticated && !isInjectedWallet && openMigrationModal) {
      return openMigrationModal;
    }
    if (!authenticated && !isInjectedWallet) {
      return login;
    }
    if (hasInsufficientBalance && !isInjectedWallet && authenticated) {
      return handleFundWallet;
    }
    if (!isUserVerified && (authenticated || isInjectedWallet)) {
      return setIsKycModalOpen;
    }
    return handleSwap;
  };

  return {
    isEnabled,
    buttonText,
    buttonAction,
    hasInsufficientBalance,
    isMigrationMandatory,
  };
}
