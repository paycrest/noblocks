import { usePrivy } from "@privy-io/react-auth";
import { UseFormWatch } from "react-hook-form";

interface UseSwapButtonProps {
  watch: UseFormWatch<any>;
  balance?: number;
  isDirty: boolean;
  isValid: boolean;
  isUserVerified: boolean;
  isExternalWallet?: boolean;
}

export function useSwapButton({
  watch,
  balance = 0,
  isDirty,
  isValid,
  isUserVerified,
  isExternalWallet = false,
}: UseSwapButtonProps) {
  const { authenticated } = usePrivy();
  const { amountSent, currency, recipientName } = watch();

  const isAmountValid = Number(amountSent) >= 0.5;
  const isCurrencySelected = Boolean(currency);
  const hasInsufficientBalance = authenticated && amountSent > balance;

  const isEnabled = (() => {
    // If external wallet with insufficient funds, disable the button
    if (hasInsufficientBalance && isExternalWallet) {
      return false;
    }

    // If smart wallet needs funding, enable the button
    if (hasInsufficientBalance && !isExternalWallet) {
      return true;
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
    // For external wallets with insufficient funds, show "Insufficient funds"
    if (authenticated && hasInsufficientBalance) {
      return isExternalWallet ? "Insufficient funds" : "Fund wallet";
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
    if (!authenticated) {
      return login;
    }
    if (hasInsufficientBalance && !isExternalWallet) {
      return handleFundWallet;
    }
    if (!isUserVerified) {
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
