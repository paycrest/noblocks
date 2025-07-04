import { useState, useCallback } from "react";
import {
  encodeFunctionData,
  erc20Abi,
  parseUnits,
  createPublicClient,
  http,
} from "viem";
import { toast } from "sonner";
import { getRpcUrl, fetchSupportedTokens, getExplorerLink } from "../utils";
import { saveTransaction } from "../api/aggregator";
import type { Token, Network } from "../types";
import type { User } from "@privy-io/react-auth";

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
  getAccessToken: () => Promise<string | null>;
  refreshBalance?: () => void;
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
  isPollingReceipt: boolean;
  pollingTimedOut: boolean;
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
  getAccessToken,
  refreshBalance,
}: UseSmartWalletTransferParams): UseSmartWalletTransferReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [isPollingReceipt, setIsPollingReceipt] = useState(false);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);
  const [transferAmount, setTransferAmount] = useState("");
  const [transferToken, setTransferToken] = useState("");

  // Helper to get the smart wallet address (with address)
  const getSmartWalletAddress = (): `0x${string}` | undefined => {
    if (!user?.linkedAccounts) return undefined;
    // Find the smart_wallet account with an address
    const wallet = user.linkedAccounts.find(
      (account) =>
        account.type === "smart_wallet" &&
        typeof (account as any).address === "string",
    ) as { address?: string } | undefined;
    return wallet?.address as `0x${string}` | undefined;
  };

  const transfer = useCallback(
    async ({ amount, token, recipientAddress, resetForm }: TransferArgs) => {
      setIsLoading(true);
      setIsSuccess(false);
      setError("");
      setTxHash(null);
      setIsPollingReceipt(true);
      setPollingTimedOut(false);
      setTransferAmount("");
      setTransferToken("");

      try {
        const fetchedTokens: Token[] =
          fetchSupportedTokens(selectedNetwork.chain.name) || [];
        await client?.switchChain({ id: selectedNetwork.chain.id });
        const searchToken = token.toUpperCase();
        const tokenData = fetchedTokens.find(
          (t) => t.symbol.toUpperCase() === searchToken,
        );
        const tokenAddress = tokenData?.address as `0x${string}` | undefined;
        const tokenDecimals = tokenData?.decimals;
        if (!tokenAddress || tokenDecimals === undefined) {
          setError(`Token data not found for ${token}.`);
          throw new Error(
            `Token data not found for ${token}. Available tokens: ${fetchedTokens.map((t) => t.symbol).join(", ")}`,
          );
        }
        await client?.sendTransaction({
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
        });
        setIsSuccess(true);
        // Poll for Transfer event
        let intervalId: NodeJS.Timeout;
        let timeoutId: NodeJS.Timeout;
        const publicClient = createPublicClient({
          chain: selectedNetwork.chain,
          transport: http(getRpcUrl(selectedNetwork.chain.name)),
        });
        const from = getSmartWalletAddress();
        const value = parseUnits(amount.toString(), tokenDecimals);
        const to = recipientAddress as `0x${string}`;
        const blockRange =
          selectedNetwork.chain.name.toLowerCase() === "arbitrum one" ? 25 : 10;
        const getTransferLogs = async () => {
          try {
            const toBlock = await publicClient.getBlockNumber();
            const logs = await publicClient.getContractEvents({
              address: tokenAddress,
              abi: erc20Abi,
              eventName: "Transfer",
              args: { from, to },
              fromBlock: toBlock - BigInt(blockRange),
              toBlock: toBlock,
            });
            const matchingLog = logs.find(
              (log) =>
                log.args && log.args.value?.toString() === value.toString(),
            );
            if (matchingLog) {
              clearInterval(intervalId);
              clearTimeout(timeoutId);
              setTxHash(matchingLog.transactionHash);
              setIsPollingReceipt(false);
              setTransferAmount(amount.toString());
              setTransferToken(token);
              toast.success(
                `${amount.toString()} ${token} successfully transferred`,
              );
              setIsLoading(false);
              setIsSuccess(true);
              // Save to transaction history
              await saveTransferTransaction({
                txHash: matchingLog.transactionHash,
                recipientAddress,
                amount,
                token,
              });
              if (resetForm) resetForm();
              if (refreshBalance) refreshBalance();
            }
          } catch {
            // Silent error
          }
        };
        getTransferLogs();
        intervalId = setInterval(getTransferLogs, 2000);
        timeoutId = setTimeout(() => {
          clearInterval(intervalId);
          setIsPollingReceipt(false);
          setPollingTimedOut(true);
          setIsSuccess(true);
          setIsLoading(false);
          if (resetForm) resetForm();
          if (refreshBalance) refreshBalance();
        }, 20000);
      } catch (e: unknown) {
        setError(
          (e as { shortMessage?: string; message?: string }).shortMessage ||
            (e as { message?: string }).message ||
            "Transfer failed",
        );
        setIsLoading(false);
        setIsPollingReceipt(false);
        setIsSuccess(false);
      }
    },
    [client, selectedNetwork, user, getAccessToken, refreshBalance],
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
        const from = getSmartWalletAddress();
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
    isPollingReceipt,
    pollingTimedOut,
    transferAmount,
    transferToken,
    transfer,
    getTxExplorerLink,
  };
}
