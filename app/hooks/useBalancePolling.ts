import { useEffect, useRef } from "react";
import { useBalance } from "../context";
import { useActiveAccount } from "thirdweb/react";

export const useBalancePolling = (
  onBalanceChange: (newBalance: number) => void,
  pollingInterval = 2000, // Poll every 2 seconds
  maxAttempts = 30, // Maximum 1 minute of polling
) => {
  const { smartWalletBalance, refreshBalance } = useBalance();
  const account = useActiveAccount();
  const initialBalance = useRef<number | null>(null);
  const attempts = useRef(0);

  useEffect(() => {
    if (!account?.address) return;

    // Get the current smart wallet balance
    const currentBalance = smartWalletBalance?.total || 0;

    // Set initial balance on first render
    if (initialBalance.current === null) {
      initialBalance.current = currentBalance;
      return;
    }

    // Start polling when initial balance is set
    const pollInterval = setInterval(() => {
      attempts.current += 1;
      refreshBalance(); // Refresh the balance on each poll

      // Check if balance has changed
      if (currentBalance !== initialBalance.current) {
        onBalanceChange(currentBalance);
        clearInterval(pollInterval);
        return;
      }

      // Stop polling after max attempts
      if (attempts.current >= maxAttempts) {
        clearInterval(pollInterval);
      }
    }, pollingInterval);

    return () => {
      clearInterval(pollInterval);
    };
  }, [
    account?.address,
    smartWalletBalance,
    refreshBalance,
    onBalanceChange,
    pollingInterval,
    maxAttempts,
  ]);

  return {
    isPolling: attempts.current > 0 && attempts.current < maxAttempts,
    attempts: attempts.current,
  };
};
