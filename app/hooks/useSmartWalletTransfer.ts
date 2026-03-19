import { useState, useCallback } from "react";
import { erc20Abi, parseUnits, http, encodeFunctionData, createPublicClient } from "viem";
import { toast } from "sonner";
import { getExplorerLink, getRpcUrl } from "../utils";
import { saveTransaction } from "../api/aggregator";
import { mapToUserMessage, isSuppressed } from "../lib/errorMessages";
import { trackEvent } from "./analytics/useMixpanel";
import type { Token, Network } from "../types";
import type { User } from "@privy-io/react-auth";
import {
  useShouldUseEOA,
  useDelegationContractAuth,
  get7702AuthorizedImplementationForAddress,
} from "./useEIP7702Account";
import { useWallets } from "@privy-io/react-auth";
import config, { getDelegationContractAddress } from "../lib/config";
import {
  buildBatchDigest,
  encodeExecuteBatch,
  readBatchNonce,
  type BatchCall,
} from "../lib/providerBatch";

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
  const { signDelegationAuthorization } = useDelegationContractAuth();
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
      const walletType = shouldUseEOA && embeddedWallet ? "EIP-7702 (bundler)" : "Smart wallet";
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

        const bundlerUrl = "/api/bundler";

        const chain = selectedNetwork.chain;
        const chainId = chain.id;
        await embeddedWallet.switchChain(chainId);
        const provider = await embeddedWallet.getEthereumProvider();
        const rpcUrl = getRpcUrl(selectedNetwork.chain.name);
        if (!rpcUrl) {
          throw new Error(`RPC URL not configured for ${selectedNetwork.chain.name}.`);
        }

        const accountAddress = embeddedWallet.address as `0x${string}`;

        const delegationContractAddress = getDelegationContractAddress(chain.id);
        if (!delegationContractAddress || delegationContractAddress === "") {
          throw new Error(
            `Delegation contract not configured for ${selectedNetwork.chain.name}. Set the contract for chain ${chainId}.`
          );
        }

        const publicClient = createPublicClient({
          chain,
          transport: http(rpcUrl),
        });

        const expectedDelegation = delegationContractAddress.toLowerCase();
        const currentImplementation = await get7702AuthorizedImplementationForAddress(
          chain,
          rpcUrl,
          accountAddress,
        );
        // Only send authorization when EOA is not delegated, or delegated to a different contract.
        const needsDelegation =
          !currentImplementation ||
          currentImplementation.toLowerCase() !== expectedDelegation;

        let authorization: Awaited<ReturnType<typeof signDelegationAuthorization>> | undefined;
        if (needsDelegation) {
          authorization = await signDelegationAuthorization(chainId);
        }

        // 2) Build single transfer call
        const call: BatchCall =
          tokenData?.isNative && tokenData?.address === ""
            ? {
                to: recipientAddress as `0x${string}`,
                value: parseUnits(amount.toString(), 18),
                data: "0x",
              }
            : (() => {
                const tokenAddress = tokenData?.address as `0x${string}` | undefined;
                const tokenDecimals = tokenData?.decimals;
                if (!tokenAddress || tokenDecimals === undefined) {
                  const err = `Token data not found for ${token}.`;
                  setError(err);
                  throw new Error(
                    `${err} Available: ${availableTokens.map((t) => t.symbol).join(", ")}`,
                  );
                }
                return {
                  to: tokenAddress,
                  value: BigInt(0),
                  data: encodeFunctionData({
                    abi: erc20Abi,
                    functionName: "transfer",
                    args: [
                      recipientAddress as `0x${string}`,
                      parseUnits(amount.toString(), tokenDecimals),
                    ],
                  }),
                };
              })();

        // 3) Read nonce (use 0 if account not yet delegated)
        const nonce = await readBatchNonce(publicClient, accountAddress).catch(() => BigInt(0));

        // 4) Sign batch digest (userOps) before sending to bundler
        const digest = buildBatchDigest(nonce, [call]);
        const rawSignature = (await provider.request({
          method: "personal_sign",
          params: [digest, accountAddress],
        })) as string;
        const signature = (rawSignature.startsWith("0x") ? rawSignature : `0x${rawSignature}`) as `0x${string}`;

        // 5) Encode and send to bundler for sponsorship (7702: server validates auth targets delegationContractAddress)
        const callData = encodeExecuteBatch([call], signature);
        const payload = {
          chainId,
          rpcUrl,
          accountAddress,
          callData,
          delegationContractAddress,
          ...(authorization != null && { eip7702Authorization: authorization }),
        };
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error("Authentication required. Please sign in to complete this transfer.");
        }
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        };
        let res: Response;
        try {
          res = await fetch(`${bundlerUrl}/execute-sponsored`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload, (_key, value) =>
              typeof value === "bigint" ? value.toString() : value,
            ),
          });
        } catch (fetchErr: unknown) {
          const isNetworkErr =
            (typeof (fetchErr as Error)?.message === "string" &&
              (fetchErr as Error).message.toLowerCase().includes("fetch")) ||
            (fetchErr as Error)?.name === "TypeError";
          const chainName = selectedNetwork.chain.name;
          throw new Error(
            isNetworkErr
              ? `Cannot reach the transaction server. Check that NEXT_PUBLIC_BUNDLER_SERVER_URL is set and the server is running. For ${chainName}, ensure the server has been restarted with support for this network.`
              : (fetchErr as Error)?.message ?? "Network request failed",
          );
        }
        if (!res.ok) {
          const errBody = await res.text();
          let errMsg: string;
          try {
            const j = JSON.parse(errBody) as { error?: string };
            errMsg = (j?.error ?? errBody) || res.statusText;
          } catch {
            errMsg = errBody || res.statusText;
          }
          throw new Error(errMsg);
        }
        const data = (await res.json()) as { transactionHash?: string };
        hash = (data.transactionHash ?? "") as `0x${string}`;

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
        const rawMessage =
          (e as { shortMessage?: string; message?: string }).shortMessage ||
          (e as { message?: string }).message ||
          "Transfer failed";
        const userMsg = mapToUserMessage(e);

        if (!isSuppressed(userMsg)) {
          setError(userMsg);
        }
        setIsLoading(false);
        setIsSuccess(false);

        // Track failed transfer
        trackEvent("Transfer failed", {
          Amount: amount,
          "Send token": token,
          "Recipient address": recipientAddress,
          Network: selectedNetwork.chain.name,
          "Reason for failure": rawMessage,
          "Transfer date": new Date().toISOString(),
          "Error type": rawMessage.includes("429")
            ? "RPC Rate Limited"
            : rawMessage.includes("HTTP")
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
      signDelegationAuthorization,
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
