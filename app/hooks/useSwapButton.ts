import { usePrivy } from "@privy-io/react-auth";
import { UseFormWatch } from "react-hook-form";
import { useInjectedWallet } from "../context";
import { calculateSenderFee } from "../utils";

interface UseSwapButtonProps {
  watch: UseFormWatch<any>;
  balance?: number;
  isDirty: boolean;
  isValid: boolean;
  isUserVerified: boolean;
  rate?: number | null;
  tokenDecimals?: number;
  isSwapped?: boolean; // true when in onramp mode (fiat in Send, token in Receive)
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
}: UseSwapButtonProps) {
  const { authenticated } = usePrivy();
  const { isInjectedWallet } = useInjectedWallet();
  const { amountSent, currency, recipientName, walletAddress } = watch();

  const isAmountValid = Number(amountSent) >= 0.5;
  const isCurrencySelected = Boolean(currency);

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
  ) => {
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
  };
}
