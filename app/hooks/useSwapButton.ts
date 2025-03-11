import { usePrivy } from "@privy-io/react-auth";
import { UseFormWatch } from "react-hook-form";

interface UseSwapButtonProps {
  watch: UseFormWatch<any>;
  balance?: number;
  isDirty: boolean;
  isValid: boolean;
  isUserVerified: boolean;
  isMiniPay?: boolean;
}

export function useSwapButton({
  watch,
  balance = 0,
  isDirty,
  isValid,
  isUserVerified,
  isMiniPay = false,
}: UseSwapButtonProps) {
  const { authenticated } = usePrivy();
  const { amountSent, currency, recipientName } = watch();

  const isAmountValid = Number(amountSent) >= 0.5;
  const isCurrencySelected = Boolean(currency);

  const hasInsufficientBalance = amountSent > balance;

  const isEnabled = (() => {
    if (isMiniPay && hasInsufficientBalance) {
      return false;
    }

    if (hasInsufficientBalance && !isMiniPay && authenticated) {
      return true;
    }

    if (isMiniPay) {
      if (!isDirty || !isValid || !isCurrencySelected || !isAmountValid) {
        return false;
      }
      return Boolean(recipientName);
    }

    if (
      !isUserVerified &&
      authenticated &&
      amountSent > 0 &&
      isCurrencySelected &&
      isAmountValid &&
      isDirty
    ) {
      return true;
    }

    if (!isDirty || !isValid || !isCurrencySelected || !isAmountValid) {
      return false;
    }

    if (!authenticated) {
      return true; // Enable for login if amount and currency are valid
    }

    return Boolean(recipientName); // Additional check for authenticated users
  })();

  const buttonText = (() => {
    if (isMiniPay && hasInsufficientBalance) {
      return "Insufficient balance";
    }

    if (authenticated && hasInsufficientBalance && !isMiniPay) {
      return "Fund wallet";
    }

    if (!isUserVerified && authenticated && amountSent > 0) {
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
    if (!authenticated && !isMiniPay) {
      return login;
    }
    if (hasInsufficientBalance && !isMiniPay && authenticated) {
      return handleFundWallet;
    }
    if (!isUserVerified && authenticated) {
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
