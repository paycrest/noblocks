"use client";

import { useState, useCallback } from "react";
import { erc20Abi, http, encodeFunctionData, createPublicClient } from "viem";
import { toast } from "sonner";
import { getExplorerLink, getRpcUrl } from "../utils";
import { saveTransaction } from "../api/aggregator";
import { mapReportAndAct } from "../lib/toastMappedError";
import { trackEvent } from "./analytics/useMixpanel";
import type { Token, Network } from "../types";
import type { User } from "@privy-io/react-auth";
import { useStarknet, useTron } from "../context";
import {
  useShouldUseEOA,
  useDelegationContractAuth,
  get7702AuthorizedImplementationForAddress,
} from "./useEIP7702Account";
import { useWallets } from "@privy-io/react-auth";
import config, {
  getDelegationContractAddress,
  STARKNET_READY_ACCOUNT_CLASSHASH,
} from "../lib/config";
import {
  buildBatchDigest,
  encodeExecuteBatch,
  readBatchNonce,
  type BatchCall,
} from "../lib/providerBatch";
import {
  amountNumberToBaseUnits,
  isValidTokenDecimals,
} from "../lib/tokenSpendAmount";

/**
 * The transfer request got no usable answer (network failure, gateway timeout),
 * so the transaction may or may not have been submitted. Callers must not
 * simply resend.
 */
export class TransferOutcomeUnknownError extends Error {
  constructor() {
    super(
      "Could not confirm the transfer. Check your transaction history before trying again.",
    );
    this.name = "TransferOutcomeUnknownError";
  }
}

/**
 * Sends a token from the user's Starknet wallet through the sponsored
 * /api/starknet/transfer route and returns the transaction hash. `amount` is in
 * base units. Shared by withdrawals (below) and sender-API sells, which pay
 * their order's deposit address the same way. An error other than
 * TransferOutcomeUnknownError means the route answered that nothing was sent.
 */
export async function requestStarknetTransfer({
  accessToken,
  walletId,
  publicKey,
  address,
  tokenAddress,
  amount,
  recipientAddress,
}: {
  accessToken: string;
  walletId: string;
  publicKey: string;
  address: string | null;
  tokenAddress: string;
  amount: string;
  recipientAddress: string;
}): Promise<`0x${string}`> {
  let response: Response;
  let data: { error?: string; transactionHash?: string; outcome?: string };
  try {
    response = await fetch("/api/starknet/transfer", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        walletId,
        publicKey,
        classHash: STARKNET_READY_ACCOUNT_CLASSHASH,
        tokenAddress,
        amount,
        recipientAddress,
        address,
      }),
    });
    data = await response.json();
  } catch {
    throw new TransferOutcomeUnknownError();
  }
  // A failure while submitting (route says so) or from a gateway in front of it
  // (502-504) may still have sent the transfer.
  if (!response.ok && (data.outcome === "unknown" || response.status >= 502)) {
    throw new TransferOutcomeUnknownError();
  }
  if (!response.ok) {
    throw new Error(data.error || "Transfer failed");
  }
  const hash = (data.transactionHash ?? "") as `0x${string}`;
  if (!hash) throw new Error("No transaction hash returned");
  return hash;
}

interface UseSmartWalletTransferParams {
  selectedNetwork: { chain: Network["chain"] };
  user: User | null;
  supportedTokens: Token[];
  getAccessToken: () => Promise<string | null>;
  refreshBalance?: () => void;
  onRequireMigration?: () => void;
  starknetWallet?: {
    walletId: string | null;
    publicKey: string | null;
    address: string | null;
    deployed: boolean;
  };
}

interface TransferArgs {
  amount: number | string;
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
  starknetWallet,
}: UseSmartWalletTransferParams): UseSmartWalletTransferReturn {
  const shouldUseEOA = useShouldUseEOA();
  const { wallets } = useWallets();
  const { signDelegationAuthorization } = useDelegationContractAuth();
  const { ensureWalletExists } = useStarknet();
  const { address: tronAddress } = useTron();
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

        if (selectedNetwork.chain.name === "Starknet") {
          const tokenAddress = tokenData?.address as `0x${string}` | undefined;
          const tokenDecimals = tokenData?.decimals;
          if (!tokenAddress?.trim() || !isValidTokenDecimals(tokenDecimals)) {
            const err = `Token data not found for ${token}.`;
            setError(err);
            throw new Error(
              `${err} Available: ${availableTokens.map((t) => t.symbol).join(", ")}`,
            );
          }
          if (!starknetWallet?.walletId || !starknetWallet?.publicKey) {
            const err = "Starknet wallet not configured";
            setError(err);
            throw new Error(err);
          }
          if (!starknetWallet.deployed) {
            try {
              await ensureWalletExists();
              await new Promise((resolve) => setTimeout(resolve, 1000));
            } catch {
              // best-effort; transfer may still proceed if account is ready
            }
          }
          const accessToken = await getAccessToken();
          if (!accessToken) {
            throw new Error("Failed to get access token");
          }
          const amountInWei = (() => {
            try {
              return amountNumberToBaseUnits(amount, tokenDecimals).toString();
            } catch (e) {
              const msg =
                e instanceof Error
                  ? e.message
                  : "Amount is invalid or has too many decimals for this token.";
              setError(msg);
              throw new Error(msg);
            }
          })();
          const snHash = await requestStarknetTransfer({
            accessToken,
            walletId: starknetWallet.walletId,
            publicKey: starknetWallet.publicKey,
            address: starknetWallet.address,
            tokenAddress,
            amount: amountInWei,
            recipientAddress,
          });
          setTxHash(snHash);
          setTxNetworkName("Starknet");
          setTransferAmount(amount.toString());
          setTransferToken(token);
          setIsSuccess(true);
          setIsLoading(false);
          toast.success(`${amount.toString()} ${token} successfully transferred`);
          trackEvent("Transfer completed", {
            Amount: amount,
            "Send token": token,
            "Recipient address": recipientAddress,
            Network: selectedNetwork.chain.name,
            "Transaction hash": snHash,
            "Transfer date": new Date().toISOString(),
          });
          await saveTransferTransaction({
            txHash: snHash,
            recipientAddress,
            amount,
            token,
          });
          if (resetForm) resetForm();
          if (refreshBalance) refreshBalance();
          return;
        }

        if (selectedNetwork.chain.name === "Tron") {
          // The server signs (Privy, as the user), pays the TRX within the sponsored limits and
          // records the transfer row itself.
          if (!tronAddress) {
            const err = "Tron wallet not ready";
            setError(err);
            throw new Error(err);
          }
          const accessToken = await getAccessToken();
          if (!accessToken) throw new Error("Failed to get access token");
          let response: Response;
          let data: { error?: string; outcome?: string; transactionHash?: string };
          try {
            response = await fetch("/api/tron/transfer", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify({
                kind: "withdrawal",
                from: tronAddress,
                to: recipientAddress,
                token,
                amount: amount.toString(),
              }),
            });
            data = await response.json();
          } catch {
            throw new TransferOutcomeUnknownError();
          }
          if (!response.ok && (data.outcome === "unknown" || response.status >= 502)) {
            throw new TransferOutcomeUnknownError();
          }
          if (!response.ok || !data.transactionHash) {
            throw new Error(data.error || "Transfer failed");
          }
          setTxHash(data.transactionHash);
          setTxNetworkName("Tron");
          setTransferAmount(amount.toString());
          setTransferToken(token);
          setIsSuccess(true);
          setIsLoading(false);
          toast.success(`${amount.toString()} ${token} successfully transferred`);
          trackEvent("Transfer completed", {
            Amount: amount,
            "Send token": token,
            "Recipient address": recipientAddress,
            Network: "Tron",
            "Transaction hash": data.transactionHash,
            "Transfer date": new Date().toISOString(),
          });
          if (resetForm) resetForm();
          if (refreshBalance) refreshBalance();
          return;
        }

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
        const isNativeTransfer =
          tokenData?.isNative &&
          (tokenData?.address === "" || tokenData?.address == null);
        const spendDecimals = isNativeTransfer
          ? chain.nativeCurrency.decimals
          : tokenData?.decimals;

        if (!isValidTokenDecimals(spendDecimals)) {
          const err = `Token decimals missing or invalid for ${token}.`;
          setError(err);
          throw new Error(err);
        }

        const amountWei = (() => {
          try {
            return amountNumberToBaseUnits(amount, spendDecimals);
          } catch (e) {
            const msg =
              e instanceof Error
                ? e.message
                : "Amount is invalid or has too many decimals for this token.";
            setError(msg);
            throw new Error(msg);
          }
        })();

        const call: BatchCall =
          isNativeTransfer
            ? {
                to: recipientAddress as `0x${string}`,
                value: amountWei,
                data: "0x",
              }
            : (() => {
                const erc20Address = tokenData?.address as `0x${string}` | undefined;
                if (!erc20Address?.trim()) {
                  const err = `Token data not found for ${token}.`;
                  setError(err);
                  throw new Error(
                    `${err} Available: ${availableTokens.map((t) => t.symbol).join(", ")}`,
                  );
                }
                return {
                  to: erc20Address,
                  value: BigInt(0),
                  data: encodeFunctionData({
                    abi: erc20Abi,
                    functionName: "transfer",
                    args: [recipientAddress as `0x${string}`, amountWei],
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
              ? `Cannot reach the transaction service. Check your connection and try again. If this persists, ${chainName} may not be configured for sponsored transactions.`
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
        mapReportAndAct(e, {
          feature: "smart-wallet-transfer",
          onUserMessage: (userMsg) => setError(userMsg),
        });
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
            : rawMessage.toLowerCase().includes("http")
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
      starknetWallet,
      ensureWalletExists,
      tronAddress,
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
      amount: number | string;
      token: string;
    }) => {
      try {
        const from =
          selectedNetwork.chain.name === "Starknet"
            ? starknetWallet?.address ?? undefined
            : getEmbeddedWalletAddress();
        if (!user || !from) return;
        const accessToken = await getAccessToken();
        if (!accessToken) return;
        const amountRecorded =
          typeof amount === "number" ? amount : Number(amount);
        const transaction = {
          walletAddress: from,
          transactionType: "transfer" as const,
          network: selectedNetwork.chain.name,
          fromCurrency: token,
          toCurrency: token,
          amountSent: amountRecorded,
          amountReceived: amountRecorded,
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
    [user, getAccessToken, selectedNetwork, starknetWallet],
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
