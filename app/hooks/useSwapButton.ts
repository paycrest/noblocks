import { usePrivy } from "@privy-io/react-auth";
import { UseFormWatch } from "react-hook-form";

interface UseSwapButtonProps {
  watch: UseFormWatch<any>;
  balance?: number;
  isDirty: boolean;
  isValid: boolean;
}

export function useSwapButton({
  watch,
  balance = 0,
  isDirty,
  isValid,
}: UseSwapButtonProps) {
  const { authenticated } = usePrivy();
  const { amountSent, currency, recipientName } = watch();

  const isAmountValid = Number(amountSent) >= 0.5;
  const isCurrencySelected = Boolean(currency);
  const hasInsufficientBalance = authenticated && amountSent > balance;

  const isEnabled = (() => {
    // If needs funding, always enable the button
    if (hasInsufficientBalance) {
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
    if (authenticated && hasInsufficientBalance) {
      return "Fund Wallet";
    }
    return "Swap";
  })();

  const buttonAction = (
    handleSwap: () => void,
    login: () => void,
    handleFundWallet: () => void,
  ) => {
    if (!authenticated) {
      return login;
    }
    if (hasInsufficientBalance) {
      return handleFundWallet;
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
