import { useState, useCallback } from "react";
import { erc20Abi, parseUnits, http } from "viem";
import { toast } from "sonner";
import { getExplorerLink, getRpcUrl } from "../utils";
import { saveTransaction } from "../api/aggregator";
import { trackEvent } from "./analytics/useMixpanel";
import type { Token, Network } from "../types";
import type { User } from "@privy-io/react-auth";
import { useShouldUseEOA, useBiconomy7702Auth } from "./useEIP7702Account";
import { useWallets } from "@privy-io/react-auth";
import {
  createMeeClient,
  toMultichainNexusAccount,
  getMEEVersion,
  MEEVersion,
} from "@biconomy/abstractjs";
import config from "../lib/config";

interface UseSmartWalletTransferParams {
  selectedNetwork: { chain: Network["chain"] };
  user: User | null;
  supportedTokens: Token[];
  getAccessToken: () => Promise<string | null>;
  refreshBalance?: () => void;
  onRequireMigration?: () => void;
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
  selectedNetwork,
  user,
  supportedTokens,
  getAccessToken,
  refreshBalance,
  onRequireMigration,
}: UseSmartWalletTransferParams): UseSmartWalletTransferReturn {
  const shouldUseEOA = useShouldUseEOA();
  const { wallets } = useWallets();
  const { signBiconomyAuthorization } = useBiconomy7702Auth();
  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");

  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [transferAmount, setTransferAmount] = useState("");
  const [transferToken, setTransferToken] = useState("");
  const [txNetworkName, setTxNetworkName] = useState<string>("");

  // Helper to get the embedded wallet address (with address) for tx history
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
      const walletType = shouldUseEOA && embeddedWallet ? "EIP-7702 (MEE)" : "Smart wallet";
      trackEvent("Transfer started", {
        Amount: amount,
        "Send token": token,
        "Recipient address": recipientAddress,
        Network: selectedNetwork.chain.name,
        "Wallet type": walletType,
        "Transfer date": new Date().toISOString(),
      });

      setIsLoading(true);
      setIsSuccess(false);
      setError("");
      setTxHash(null);
      setTxNetworkName("");
      setTransferAmount("");
      setTransferToken("");

      try {
        const availableTokens: Token[] = supportedTokens;
        const searchToken = token.toUpperCase();
        const tokenData = availableTokens.find(
          (t) => t.symbol.toUpperCase() === searchToken,
        );

        if (!shouldUseEOA) {
          onRequireMigration?.();
          setIsLoading(false);
          setIsSuccess(false);
          setError("");
          return;
        }

        let hash: `0x${string}`;

        if (!embeddedWallet) {
          throw new Error("Embedded wallet not ready. Please reconnect and try again.");
        }
        // EIP-7702 + Biconomy MEE path (migrated EOA or 0-balance SCW)
        const chain = selectedNetwork.chain;
        const chainId = chain.id;
        await embeddedWallet.switchChain(chainId);
        const provider = await embeddedWallet.getEthereumProvider();
        const authorization = await signBiconomyAuthorization(chainId);
        const nexusAccount = await toMultichainNexusAccount({
          chainConfigurations: [
            {
              chain,
              transport: http(getRpcUrl(selectedNetwork.chain.name)),
              version: getMEEVersion(MEEVersion.V2_1_0),
              accountAddress: embeddedWallet.address as `0x${string}`,
            },
          ],
          signer: provider,
        });
        const meeApiKey = config.biconomyMeeApiKey;
        if (!meeApiKey) {
          throw new Error("Biconomy MEE API key not configured. Set NEXT_PUBLIC_BICONOMY_MEE_API_KEY.");
        }
        const meeClient = await createMeeClient({
          account: nexusAccount,
          apiKey: meeApiKey,
        });

        const transferInstruction =
          tokenData?.isNative && tokenData?.address === ""
            ? await nexusAccount.buildComposable({
                type: "nativeTokenTransfer",
                data: {
                  chainId,
                  to: recipientAddress as `0x${string}`,
                  value: parseUnits(amount.toString(), 18),
                },
              })
            : await (async () => {
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
                return nexusAccount.buildComposable({
                  type: "default",
                  data: {
                    abi: erc20Abi,
                    chainId,
                    to: tokenAddress,
                    functionName: "transfer",
                    args: [
                      recipientAddress as `0x${string}`,
                      parseUnits(amount.toString(), tokenDecimals),
                    ],
                  },
                });
              })();

        const result = await meeClient.execute({
          authorizations: [authorization],
          delegate: true,
          sponsorship: true,
          instructions: [transferInstruction],
        });
        const receipt = await meeClient.waitForSupertransactionReceipt({
          hash: result.hash,
          waitForReceipts: true,
        });
        const onChainTxHash =
          (receipt.receipts?.[0] as { transactionHash?: `0x${string}` } | undefined)
            ?.transactionHash ??
          (receipt.userOps?.[0] as { executionData?: `0x${string}` } | undefined)
            ?.executionData;
        hash = (onChainTxHash ?? result.hash) as `0x${string}`;

        if (!hash) throw new Error("No transaction hash returned");
        setTxHash(hash);
        setTxNetworkName(selectedNetwork.chain.name);

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
      selectedNetwork,
      user,
      supportedTokens,
      getAccessToken,
      refreshBalance,
      shouldUseEOA,
      embeddedWallet,
      signBiconomyAuthorization,
      onRequireMigration,
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
          email: user?.email?.address ?? undefined,
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
    if (!txHash || !txNetworkName) return undefined;
    return getExplorerLink(txNetworkName, txHash) || undefined;
  }, [txHash, txNetworkName]);

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
