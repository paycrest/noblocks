import { useFundWallet } from "@privy-io/react-auth";
import { useNetwork } from "../context/NetworksContext";
import { useBalance } from "../context/BalanceContext";
import { trackEvent } from "./analytics";
import { fetchSupportedTokens } from "../utils";

export const useFundWalletHandler = (entryPoint: string) => {
  const { selectedNetwork } = useNetwork();
  const { refreshBalance } = useBalance();

  const { fundWallet } = useFundWallet({
    onUserExited: ({ fundingMethod, chain }) => {
      const lastFunding = JSON.parse(
        localStorage.getItem("lastFundingAttempt") || "{}",
      );

      /* NOTE: This is a not so accurate way of tracking funding status
      Privy doesn't provide detailed funding status information
      Available variables in onUserExited: address, chain, fundingMethod, balance
      
      Limitations:
      1. fundingMethod only indicates user selected a method, not if funding completed
      2. User can select method and cancel, but it still records as "completed"
      3. No way to track funding errors
      4. balance is returned as bigint and doesn't specify token type
      5. No webhook or callback for actual funding confirmation */

      if (fundingMethod) {
        refreshBalance();
        trackEvent("Funding completed", {
          "Funding type": fundingMethod,
          Amount: lastFunding.amount || "Not available",
          Network: lastFunding.network || chain.name,
          Token: lastFunding.token || "Unknown",
          "Funding date": lastFunding.timestamp || new Date().toISOString(),
        });
      } else {
        trackEvent("Funding cancelled", {
          "Funding type": "User exited the funding process",
          Amount: lastFunding.amount || "Not available",
          Network: lastFunding.network || chain.name,
          Token: lastFunding.token || "Unknown",
          "Funding date": lastFunding.timestamp || new Date().toISOString(),
        });
      }

      const callbackId = localStorage.getItem("fundingCallbackId");
      if (callbackId) {
        window.dispatchEvent(
          new CustomEvent("fundingCompleted", {
            detail: { callbackId, success: !!fundingMethod },
          }),
        );
        localStorage.removeItem("fundingCallbackId");
      }

      localStorage.removeItem("lastFundingAttempt");
    },
  });

  const handleFundWallet = async (
    walletAddress: string,
    amount: string,
    tokenAddress: `0x${string}`,
    onComplete?: (success: boolean) => void,
  ) => {
    const fetchedTokens = fetchSupportedTokens(selectedNetwork.chain.name);
    const selectedToken = fetchedTokens?.find(
      (t) => t.address === tokenAddress,
    );

    trackEvent("Funding started", {
      "Entry point": entryPoint,
      Amount: amount,
      Network: selectedNetwork.chain.name,
      Token: selectedToken?.symbol || "Unknown",
      "Funding date": new Date().toISOString(),
    });

    localStorage.setItem(
      "lastFundingAttempt",
      JSON.stringify({
        amount,
        token: selectedToken?.symbol,
        network: selectedNetwork.chain.name,
        timestamp: new Date().toISOString(),
      }),
    );

    if (onComplete) {
      const callbackId = Date.now().toString();
      const handleFundingCompleted = (event: CustomEvent) => {
        if (event.detail.callbackId === callbackId) {
          onComplete(event.detail.success);
          window.removeEventListener(
            "fundingCompleted",
            handleFundingCompleted as EventListener,
          );
        }
      };

      window.addEventListener(
        "fundingCompleted",
        handleFundingCompleted as EventListener,
      );
      localStorage.setItem("fundingCallbackId", callbackId);
    }

    await fundWallet(walletAddress, {
      amount,
      chain: selectedNetwork.chain,
      asset: { erc20: tokenAddress },
    });
  };

  return { handleFundWallet };
};
