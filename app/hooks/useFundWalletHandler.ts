import { useNetwork } from "../context/NetworksContext";
import { useBalance } from "../context/BalanceContext";
import { trackEvent } from "./analytics";
import { fetchSupportedTokens, getRpcUrl } from "../utils";
import { THIRDWEB_CLIENT } from "../lib/thirdweb/client";
import type { Chain } from "thirdweb";

type ChainWithRpc = Chain & { rpc: string };

export const useFundWalletHandler = (entryPoint: string) => {
  const { selectedNetwork } = useNetwork();
  const { refreshBalance } = useBalance();

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

    // Store funding attempt details for tracking
    localStorage.setItem(
      "lastFundingAttempt",
      JSON.stringify({
        amount,
        token: selectedToken?.symbol,
        network: selectedNetwork.chain.name,
        timestamp: new Date().toISOString(),
      }),
    );

    // Set up callback handling
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

    // Get RPC URL for the chain
    const rpcUrl = getRpcUrl(selectedNetwork.chain.name);
    if (!rpcUrl) {
      throw new Error("RPC URL not found for network");
    }

    // Return the PayEmbed configuration
    return {
      client: THIRDWEB_CLIENT,
      payOptions: {
        mode: "fund_wallet",
        metadata: {
          name: "Get funds",
        },
        prefillBuy: {
          chain: {
            ...selectedNetwork.chain,
            rpc: rpcUrl,
          } as ChainWithRpc,
          amount: amount,
        },
      },
    };
  };

  return { handleFundWallet };
};
