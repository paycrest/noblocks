"use client";

import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { encodeFunctionData, erc20Abi } from "viem";
import {
  selectEngine,
  NearIntentsClient,
  LifiClient,
  toLifiChainId,
  resolveNearAssetId,
  toRawAmount,
  evmBatchExecute,
  executeBatchCalls,
} from "@/app/lib/bridge";
import type { BridgeLeg, BridgeQuote, BridgeStatusResult, BridgeEngine, NearIntentsToken } from "@/app/lib/bridge";
import type { BatchCall } from "@/app/lib/providerBatch";
import { STARKNET_READY_ACCOUNT_CLASSHASH } from "@/app/lib/config";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const nearClient = new NearIntentsClient();
const lifiClient = new LifiClient();

// ============================================================================
// useBridgeQuote
// ============================================================================

interface UseBridgeQuoteParams {
  from: BridgeLeg | null;
  to: BridgeLeg | null;
  amount: string; // human-readable
  evmAddress: string;       // EVM embedded wallet address (for EVM legs)
  starknetAddress: string;  // Starknet wallet address (for Starknet legs)
  slippageBps: number;
  enabled: boolean;
  getAccessToken?: () => Promise<string | null>; // for the auth-gated bridge proxy
}

export function useBridgeQuote({
  from,
  to,
  amount,
  evmAddress,
  starknetAddress,
  slippageBps,
  enabled,
  getAccessToken,
}: UseBridgeQuoteParams) {
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const fetchQuote = useCallback(async (): Promise<BridgeQuote | null> => {
    if (!from || !to || !amount || parseFloat(amount) <= 0) return null;

    const token = (await getAccessToken?.()) ?? null;
    const engine = selectEngine(from, to);
    const rawAmount = toRawAmount(amount, from.decimals);

    if (engine === "near") {
      const tokensRes = await fetch("/api/bridge/near-intents/tokens", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const tokenList: NearIntentsToken[] = tokensRes.ok ? await tokensRes.json() : [];

      const originAsset = resolveNearAssetId(from.token, from.network, tokenList);
      const destinationAsset = resolveNearAssetId(to.token, to.network, tokenList);

      if (!originAsset || !destinationAsset) return null;

      const addrFor = (network: string) =>
        network === "Starknet" ? starknetAddress : evmAddress;

      return nearClient.getQuote({
        dry: false,
        swapType: "EXACT_INPUT",
        slippageTolerance: slippageBps,
        originAsset,
        destinationAsset,
        amount: rawAmount,
        recipient: addrFor(to.network),
        recipientType: "DESTINATION_CHAIN",
        refundTo: addrFor(from.network),
        refundType: "ORIGIN_CHAIN",
        deadline: new Date(Date.now() + 600000).toISOString(),
        depositType: "ORIGIN_CHAIN",
      }, token);
    }

    const fromChain = toLifiChainId(from.network);
    const toChain = toLifiChainId(to.network);
    if (!fromChain || !toChain) return null;

    // Honor the configured slippage for liquid pairs; only illiquid cNGN routes need the
    // 2% floor. Forcing 2% on every route silently widens slippage and risks value loss.
    const isCngn =
      from.token.toLowerCase() === "cngn" || to.token.toLowerCase() === "cngn";
    const lifiSlippage = isCngn
      ? Math.max(slippageBps / 10000, 0.02)
      : slippageBps / 10000;

    return lifiClient.getQuote({
      fromChain,
      toChain,
      fromToken: from.tokenAddress,
      toToken: to.tokenAddress,
      fromAmount: rawAmount,
      fromAddress: evmAddress,
      toAddress: evmAddress,
      slippage: lifiSlippage,
    }, token);
  }, [from, to, amount, evmAddress, starknetAddress, slippageBps, getAccessToken]);

  const queryKey = useMemo(
    () => ["bridge-quote", from?.token, from?.network, to?.token, to?.network, amount, evmAddress, starknetAddress, slippageBps],
    [from, to, amount, evmAddress, starknetAddress, slippageBps],
  );

  const addressReady = !from
    ? false
    : from.network === "Starknet"
    ? !!starknetAddress
    : !!evmAddress;

  const { data: quote, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: fetchQuote,
    enabled: enabled && !!from && !!to && parseFloat(amount || "0") > 0 && addressReady,
    staleTime: 30_000,
    retry: 1,
    refetchInterval: (q) => {
      const data = q?.state?.data as BridgeQuote | undefined;
      if (!data) return false;
      // LI.FI quotes embed a slippage/validity window but no explicit deadline — refresh on a
      // fixed interval so a stale transactionRequest is never executed (it would revert on-chain).
      if (data.kind === "lifi-tx") return 30_000;
      // NEAR deposit quotes: stop refetching once the deposit deadline has nearly passed.
      return data.deadline - Date.now() > 30_000 ? 30_000 : false;
    },
  });

  return { quote: quote ?? null, isLoading, error, refetch };
}

// ============================================================================
// useBridgeStatus
// ============================================================================

interface UseBridgeStatusParams {
  engine: BridgeEngine | null;
  refId: string | null; // depositAddress for NEAR, txHash for LI.FI
  enabled: boolean;
  getAccessToken?: () => Promise<string | null>; // for the auth-gated bridge proxy
}

export function useBridgeStatus({ engine, refId, enabled, getAccessToken }: UseBridgeStatusParams) {
  const [result, setResult] = useState<BridgeStatusResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled || !engine || !refId) {
      setResult(null);
      stop();
      return;
    }

    setIsLoading(true);

    const poll = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const token = (await getAccessToken?.()) ?? null;
        const status =
          engine === "near"
            ? await nearClient.getStatus(refId, token)
            : await lifiClient.getStatus(refId, token);

        setResult(status);
        if (status.status === "SUCCESS" || status.status === "REFUNDED" || status.status === "FAILED") {
          stop();
        }
      } catch {
        // keep polling
      } finally {
        inFlightRef.current = false;
        setIsLoading(false);
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 5_000);

    return stop;
  }, [engine, refId, enabled, stop, getAccessToken]);

  return { result, isLoading, stop };
}

// ============================================================================
// useBridgeExecute
// ============================================================================

interface UseBridgeExecuteParams {
  onSuccess?: (txHash: string) => void;
  onError?: (error: Error) => void;
  selectedNetwork?: { chain: { name: string; id: number | string } };
  getAccessToken?: () => Promise<string | null>;
  starknetWallet?: {
    walletId: string | null;
    publicKey: string | null;
    address: string | null;
    deployed: boolean;
  };
  embeddedWallet?: {
    switchChain: (chainId: number) => Promise<void>;
    getEthereumProvider: () => Promise<any>;
    address: string;
  };
  allTokens?: Record<string, any[]>;
  signDelegationAuthorization?: (chainId: number) => Promise<any>;
}

/**
 * Phase 2: Actual execution logic
 * Branches on quote.engine + from.chainKind:
 *   NEAR Intents, EVM → transfer to deposit address
 *   NEAR Intents, Starknet → Starknet transfer to deposit address
 *   LI.FI → approve + execute transaction
 */
export function useBridgeExecute({
  onSuccess,
  onError,
  selectedNetwork,
  getAccessToken,
  starknetWallet,
  embeddedWallet,
  allTokens,
  signDelegationAuthorization,
}: UseBridgeExecuteParams = {}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Use a ref so the execute callback always reads the latest selectedNetwork
  // without needing it as a useCallback dependency (avoids stale closure).
  const selectedNetworkRef = useRef(selectedNetwork);
  useEffect(() => { selectedNetworkRef.current = selectedNetwork; }, [selectedNetwork]);

  const execute = useCallback(
    async (quote: BridgeQuote, from: BridgeLeg): Promise<{ txHash: string; depositRefId: string }> => {
      setIsLoading(true);
      setError(null);

      try {
        if (quote.kind === "near-deposit") {
          // Dry quotes have no deposit address — fetch a fresh non-dry quote to get one.
          const depositAddress =
            quote.depositAddress ||
            (await nearClient.getDepositAddress(quote, await getAccessToken?.()));
          const token = from.token;

          if (from.network === "Starknet") {
            // Starknet transfer
            if (!starknetWallet?.walletId || !starknetWallet?.publicKey) {
              throw new Error("Starknet wallet not configured");
            }

            const accessToken = await getAccessToken?.();
            if (!accessToken) {
              throw new Error("Failed to get access token");
            }

            const response = await fetch("/api/starknet/transfer", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify({
                walletId: starknetWallet.walletId,
                publicKey: starknetWallet.publicKey,
                classHash: STARKNET_READY_ACCOUNT_CLASSHASH,
                tokenAddress: from.tokenAddress,
                amount: from.rawAmount,
                recipientAddress: depositAddress,
                address: starknetWallet.address,
              }),
            });

            const data = await response.json();
            if (!response.ok) {
              throw new Error(data.error || "Transfer failed");
            }

            const snHash = data.transactionHash;
            if (!snHash) throw new Error("No transaction hash returned");

            setTxHash(snHash);
            setIsSuccess(true);
            onSuccess?.(snHash);
            return { txHash: snHash, depositRefId: depositAddress };
          } else {
            // EVM transfer - use evmBatchExecute helper
            if (!embeddedWallet || !allTokens || !signDelegationAuthorization || !getAccessToken) {
              throw new Error("EVM wallet not configured");
            }

            const chain = selectedNetworkRef.current?.chain;
            if (!chain) {
              throw new Error("Selected network not found");
            }

            // Use only the from-chain's tokens so symbol lookup never picks
            // a same-symbol token from a different network (e.g. Scroll USDC vs BSC USDC).
            const chainTokens = allTokens[from.network] ?? [];

            const evmHash = await evmBatchExecute({
              chain: chain as any,
              token,
              // Pass the exact human string — parseFloat()→toString() loses precision for
              // long fractional amounts, sending an amount that differs from the NEAR quote.
              amount: from.amount,
              recipientAddress: depositAddress,
              supportedTokens: chainTokens,
              getAccessToken,
              embeddedWallet,
              signDelegationAuthorization,
            });

            setTxHash(evmHash);
            setIsSuccess(true);
            onSuccess?.(evmHash);
            return { txHash: evmHash, depositRefId: depositAddress };
          }
        } else if (quote.kind === "lifi-tx") {
          // LI.FI: optional ERC-20 approval + swap, batched through the shared 7702 executor.
          if (!embeddedWallet || !signDelegationAuthorization || !getAccessToken) {
            throw new Error("EVM wallet not configured for LI.FI execution");
          }

          const chain = selectedNetworkRef.current?.chain;
          if (!chain) {
            throw new Error("Selected network not found");
          }

          const calls: BatchCall[] = [];

          // Exact-amount approval when LI.FI requires a spender.
          const { approvalAddress } = quote.estimate;
          if (approvalAddress && approvalAddress !== ZERO_ADDRESS) {
            calls.push({
              to: from.tokenAddress as `0x${string}`,
              value: BigInt(0),
              data: encodeFunctionData({
                abi: erc20Abi,
                functionName: "approve",
                args: [approvalAddress as `0x${string}`, BigInt(from.rawAmount)],
              }),
            });
          }

          // Swap call
          calls.push({
            to: quote.transactionRequest.to as `0x${string}`,
            value: BigInt(quote.transactionRequest.value || "0"),
            data: quote.transactionRequest.data as `0x${string}`,
          });

          // LI.FI provides a recommended gasLimit for the swap call. 2x + 150k covers the
          // approval + EIP-7702 batch overhead; floor at 600k (cross-chain swaps need 300-500k+).
          const gasLimit = Math.max(
            quote.transactionRequest.gasLimit
              ? Math.ceil(parseInt(quote.transactionRequest.gasLimit) * 2) + 150_000
              : 1_500_000,
            600_000,
          );

          const evmHash = await executeBatchCalls({
            chain: chain as any,
            calls,
            getAccessToken,
            embeddedWallet,
            signDelegationAuthorization,
            gasLimit,
          });

          setTxHash(evmHash);
          setIsSuccess(true);
          onSuccess?.(evmHash);
          // LI.FI: poll status by txHash, not a separate deposit address
          return { txHash: evmHash, depositRefId: evmHash };
        }
        throw new Error("Unsupported quote type");
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Execution failed";
        setError(errorMsg);
        const errorObj = err instanceof Error ? err : new Error(errorMsg);
        onError?.(errorObj);
        throw errorObj;
      } finally {
        setIsLoading(false);
      }
    },
    [onSuccess, onError, getAccessToken, starknetWallet, embeddedWallet, allTokens, signDelegationAuthorization],
  );

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
    setTxHash(null);
    setIsSuccess(false);
  }, []);

  return { execute, isLoading, error, txHash, isSuccess, reset };
}
