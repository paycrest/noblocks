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
}

export function useSwapButton({
  watch,
  balance = 0,
  isDirty,
  isValid,
  isUserVerified,
  rate,
  tokenDecimals = 18,
}: UseSwapButtonProps) {
  const { authenticated } = usePrivy();
  const { isInjectedWallet } = useInjectedWallet();
  const { amountSent, currency, recipientName } = watch();

  const isAmountValid = Number(amountSent) >= 0.5;
  const isCurrencySelected = Boolean(currency);

  // Calculate sender fee and include in balance check
  const { feeAmount: senderFeeAmount } = calculateSenderFee(
    Number(amountSent) || 0,
    rate || 0,
    tokenDecimals,
  );
  const totalRequired = (Number(amountSent) || 0) + senderFeeAmount;

  const hasInsufficientBalance = totalRequired > balance;

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
      return Boolean(recipientName);
    }

    if (!isDirty || !isValid || !isCurrencySelected || !isAmountValid) {
      return false;
    }

    if (!authenticated && !isInjectedWallet) {
      return true; // Enable for login if amount and currency are valid
    }

    return Boolean(recipientName); // Additional check for authenticated users
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
    setIsLimitModalOpen: () => void,
    isUserVerified: boolean,
  ) => {
    if (!authenticated && !isInjectedWallet) {
      return login;
    }
    if (hasInsufficientBalance && !isInjectedWallet && authenticated) {
      return handleFundWallet;
    }
    if (!hasInsufficientBalance && !isUserVerified && (authenticated || isInjectedWallet)) {
      return setIsLimitModalOpen;
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
