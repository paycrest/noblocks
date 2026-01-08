import { useState, useCallback } from "react";
import { encodeFunctionData, erc20Abi, parseUnits } from "viem";
import { toast } from "sonner";
import { getExplorerLink } from "../utils";
import { saveTransaction } from "../api/aggregator";
import { trackEvent } from "./analytics/useMixpanel";
import type { Token, Network } from "../types";
import type { User } from "@privy-io/react-auth";
import { useStarknet } from "../context";

interface SmartWalletClient {
  sendTransaction: (args: {
    to: `0x${string}`;
    data: `0x${string}`;
    value: bigint;
  }) => Promise<unknown>;
  switchChain: (args: { id: number }) => Promise<unknown>;
}

interface UseSmartWalletTransferParams {
  client: SmartWalletClient | null;
  selectedNetwork: { chain: Network["chain"] };
  user: User | null;
  supportedTokens: Token[];
  getAccessToken: () => Promise<string | null>;
  refreshBalance?: () => void;
  starknetWallet?: {
    walletId: string | null;
    publicKey: string | null;
    address: string | null;
    deployed: boolean;
  };
}

interface TransferArgs {
  amount: number;
  token: string;
  recipientAddress: string;
  resetForm?: () => void;
}

interface UseSmartWalletTransferReturn {
  isLoading: boolean;
  isSuccess: boolean;
  error: string;
  txHash: string | null;
  transferAmount: string;
  transferToken: string;
  transfer: (args: TransferArgs) => Promise<void>;
  getTxExplorerLink: () => string | undefined;
}

/**
 * useSmartWalletTransfer
 * Handles sending ERC20 transfers, polling for onchain receipt, and saving transaction history.
 *
 * @param {UseSmartWalletTransferParams} params - Parameters object for the hook
 * @returns {UseSmartWalletTransferReturn} - State and transfer function
 */
export function useSmartWalletTransfer({
  client,
  selectedNetwork,
  user,
  supportedTokens,
  getAccessToken,
  refreshBalance,
  starknetWallet,
}: UseSmartWalletTransferParams): UseSmartWalletTransferReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [transferAmount, setTransferAmount] = useState("");
  const [transferToken, setTransferToken] = useState("");
  const { deployWallet } = useStarknet();

  // Helper to get the embedded wallet address (with address)
  const getEmbeddedWalletAddress = (): `0x${string}` | undefined => {
    if (!user?.linkedAccounts) return undefined;
    // Find the embedded wallet account with an address
    const wallet = user.linkedAccounts.find(
      (account) =>
        account.type === "wallet" &&
        (account as any).connectorType === "embedded" &&
        typeof (account as any).address === "string",
    ) as { address?: string } | undefined;
    return wallet?.address as `0x${string}` | undefined;
  };

  const transfer = useCallback(
    async ({ amount, token, recipientAddress, resetForm }: TransferArgs) => {
      // Track transfer attempt
      trackEvent("Transfer started", {
        Amount: amount,
        "Send token": token,
        "Recipient address": recipientAddress,
        Network: selectedNetwork.chain.name,
        "Wallet type": "Smart wallet",
        "Transfer date": new Date().toISOString(),
      });

      setIsLoading(true);
      setIsSuccess(false);
      setError("");
      setTxHash(null);
      setTransferAmount("");
      setTransferToken("");

      try {
        const availableTokens: Token[] = supportedTokens;

        // Only switch chain for EVM networks, not Starknet
        if (selectedNetwork.chain.name !== "Starknet") {
          await client?.switchChain({ id: selectedNetwork.chain.id });
        }

        const searchToken = token.toUpperCase();
        const tokenData = availableTokens.find(
          (t) => t.symbol.toUpperCase() === searchToken,
        );
        const tokenAddress = tokenData?.address as `0x${string}` | undefined;
        const tokenDecimals = tokenData?.decimals;
        if (!tokenAddress || tokenDecimals === undefined) {
          const error = `Token data not found for ${token}.`;
          setError(error);
          trackEvent("Transfer failed", {
            Amount: amount,
            "Send token": token,
            "Recipient address": recipientAddress,
            Network: selectedNetwork.chain.name,
            "Reason for failure": error,
            "Transfer date": new Date().toISOString(),
          });
          throw new Error(
            `Token data not found for ${token}. Available tokens: ${availableTokens.map((t) => t.symbol).join(", ")}`,
          );
        }
        let hash = "";
        if (selectedNetwork.chain.name === "Starknet") {
          // Handle Starknet transfer via API route
          if (!starknetWallet?.walletId || !starknetWallet?.publicKey) {
            const error = "Starknet wallet not configured";
            setError(error);
            trackEvent("Transfer failed", {
              Amount: amount,
              "Send token": token,
              "Recipient address": recipientAddress,
              Network: selectedNetwork.chain.name,
              "Reason for failure": error,
              "Transfer date": new Date().toISOString(),
            });
            throw new Error(error);
          }

          if (!starknetWallet?.deployed) {
            try {
              await deployWallet();

              await new Promise((resolve) => setTimeout(resolve, 1000));
            } catch (error: any) {
              console.error("[API] Wallet deployment failed:", error.message);
            }
          }

          // Get access token for API authentication
          const accessToken = await getAccessToken();
          if (!accessToken) {
            throw new Error("Failed to get access token");
          }

          // Get class hash from environment
          const classHash = process.env.NEXT_PUBLIC_STARKNET_READY_CLASSHASH;

          // Convert amount to wei (smallest unit)
          const amountInWei = parseUnits(
            amount.toString(),
            tokenDecimals,
          ).toString();

          // Call Starknet transfer API
          const response = await fetch("/api/starknet/transfer", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              walletId: starknetWallet.walletId,
              publicKey: starknetWallet.publicKey,
              classHash,
              tokenAddress,
              amount: amountInWei,
              recipientAddress,
            }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || "Transfer failed");
          }

          hash = data.transactionHash;
        } else {
          // Handle EVM transfer
          hash = (await client?.sendTransaction({
            to: tokenAddress,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "transfer",
              args: [
                recipientAddress as `0x${string}`,
                parseUnits(amount.toString(), tokenDecimals),
              ],
            }) as `0x${string}`,
            value: BigInt(0),
          })) as `0x${string}`;

          if (!hash) throw new Error("No transaction hash returned");
        }

        setTxHash(hash);

        setTransferAmount(amount.toString());
        setTransferToken(token);
        setIsSuccess(true);
        setIsLoading(false);
        toast.success(`${amount.toString()} ${token} successfully transferred`);

        // Track successful transfer
        trackEvent("Transfer completed", {
          Amount: amount,
          "Send token": token,
          "Recipient address": recipientAddress,
          Network: selectedNetwork.chain.name,
          "Transaction hash": hash,
          "Transfer date": new Date().toISOString(),
        });

        // Save to transaction history
        await saveTransferTransaction({
          txHash: hash,
          recipientAddress,
          amount,
          token,
        });
        if (resetForm) resetForm();
        if (refreshBalance) refreshBalance();
      } catch (e: unknown) {
        const errorMessage =
          (e as { shortMessage?: string; message?: string }).shortMessage ||
          (e as { message?: string }).message ||
          "Transfer failed";

        setError(errorMessage);
        setIsLoading(false);
        setIsSuccess(false);

        // Track failed transfer
        trackEvent("Transfer failed", {
          Amount: amount,
          "Send token": token,
          "Recipient address": recipientAddress,
          Network: selectedNetwork.chain.name,
          "Reason for failure": errorMessage,
          "Transfer date": new Date().toISOString(),
          "Error type": errorMessage.includes("429")
            ? "RPC Rate Limited"
            : errorMessage.includes("HTTP")
              ? "RPC Connection Error"
              : "Transaction Error",
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      client,
      selectedNetwork,
      user,
      supportedTokens,
      getAccessToken,
      refreshBalance,
      starknetWallet,
    ],
  );

  const saveTransferTransaction = useCallback(
    async ({
      txHash,
      recipientAddress,
      amount,
      token,
    }: {
      txHash: string;
      recipientAddress: string;
      amount: number;
      token: string;
    }) => {
      try {
        const from = getEmbeddedWalletAddress();
        if (!user || !from) return;
        const accessToken = await getAccessToken();
        if (!accessToken) return;
        const transaction = {
          walletAddress: from,
          transactionType: "transfer" as const,
          network: selectedNetwork.chain.name,
          fromCurrency: token,
          toCurrency: token,
          amountSent: amount,
          amountReceived: amount,
          fee: 0,
          txHash,
          recipient: {
            account_name: "",
            institution: "",
            account_identifier: recipientAddress,
          },
          status: "completed" as const,
        };
        const response = await saveTransaction(transaction, accessToken);
        if (response.success) {
          localStorage.setItem("currentTransactionId", response.data.id);
        }
      } catch {
        // Silent fail
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, getAccessToken, selectedNetwork],
  );

  const getTxExplorerLink = useCallback((): string | undefined => {
    if (!txHash) return undefined;
    return getExplorerLink(selectedNetwork.chain.name, txHash) || undefined;
  }, [txHash, selectedNetwork]);

  return {
    isLoading,
    isSuccess,
    error,
    txHash,
    transferAmount,
    transferToken,
    transfer,
    getTxExplorerLink,
  };
}
