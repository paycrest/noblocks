"use client";

import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { encodeFunctionData, erc20Abi, createPublicClient, http } from "viem";
import {
  selectEngine,
  NearIntentsClient,
  LifiClient,
  HyperfxClient,
  toLifiChainId,
  resolveNearAssetId,
  toRawAmount,
  evmBatchExecute,
  executeBatchCalls,
  authHeaders,
} from "@/app/lib/bridge";
import type { BridgeLeg, BridgeQuote, BridgeStatusResult, BridgeEngine, NearIntentsToken, BridgeAuth } from "@/app/lib/bridge";
import { getRpcUrl } from "@/app/utils";
import { appendBaseBuilderCode } from "@/app/lib/baseBuilderCode";
import type { BatchCall } from "@/app/lib/providerBatch";
import { STARKNET_READY_ACCOUNT_CLASSHASH } from "@/app/lib/config";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const nearClient = new NearIntentsClient();
const lifiClient = new LifiClient();
const hyperfxClient = new HyperfxClient();

// ============================================================================
// useBridgeQuote
// ============================================================================

/**
 * LI.FI quote for a leg pair. Serves both the routes LI.FI owns outright (cNGN) and the
 * NEAR fallback below, so the slippage rule and native-token handling live in one place.
 * Returns null when either chain is outside LI.FI's coverage (Starknet has no chain id here).
 */
async function fetchLifiQuote(
  from: BridgeLeg,
  to: BridgeLeg,
  rawAmount: string,
  evmAddress: string,
  slippageBps: number,
  auth: BridgeAuth,
): Promise<BridgeQuote | null> {
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

  // Our token data uses an empty address for native tokens; LI.FI expects the zero address.
  const lifiToken = (address: string) => address || ZERO_ADDRESS;

  return lifiClient.getQuote({
    fromChain,
    toChain,
    fromToken: lifiToken(from.tokenAddress),
    toToken: lifiToken(to.tokenAddress),
    fromAmount: rawAmount,
    fromAddress: evmAddress,
    toAddress: evmAddress,
    slippage: lifiSlippage,
  }, auth);
}

async function fetchHyperfxQuote(
  from: BridgeLeg,
  to: BridgeLeg,
  amount: string,
  evmAddress: string,
  auth: BridgeAuth,
): Promise<BridgeQuote | null> {
  return hyperfxClient.getQuote(
    {
      network: from.network,
      chainId: Number(from.chainId),
      fromToken: from.token,
      toToken: to.token,
      fromAmount: amount,
      fromDecimals: from.decimals,
      fromAddress: evmAddress,
    },
    auth,
  );
}

interface UseBridgeQuoteParams {
  from: BridgeLeg | null;
  to: BridgeLeg | null;
  amount: string; // human-readable
  evmAddress: string;       // EVM embedded wallet address (for EVM legs)
  starknetAddress: string;  // Starknet wallet address (for Starknet legs)
  slippageBps: number;
  enabled: boolean;
  getAccessToken?: () => Promise<string | null>; // for the auth-gated bridge proxy
  /**
   * Injected-wallet SIWE session token getter (passive — quote polling must
   * never pop a signature request; BridgeForm establishes the session on open).
   */
  getInjectedToken?: () => Promise<string | null>;
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
  getInjectedToken,
}: UseBridgeQuoteParams) {
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const fetchQuote = useCallback(async (): Promise<BridgeQuote | null> => {
    if (!from || !to || !amount || parseFloat(amount) <= 0) return null;

    // Injected wallets authenticate via the x-injected-token session JWT;
    // Privy wallets via the Bearer token.
    const injectedToken = (await getInjectedToken?.()) ?? null;
    const auth: BridgeAuth = injectedToken
      ? { injectedToken }
      : { token: (await getAccessToken?.()) ?? null };
    const engine = selectEngine(from, to);
    const rawAmount = toRawAmount(amount, from.decimals);

    if (engine === "hyperfx") {
      try {
        const hyperfxQuote = await fetchHyperfxQuote(
          from,
          to,
          amount,
          evmAddress,
          auth,
        );
        if (hyperfxQuote) return hyperfxQuote;
      } catch {
        // Fall through to LI.FI when HyperFX is unavailable.
      }
      return fetchLifiQuote(from, to, rawAmount, evmAddress, slippageBps, auth);
    }

    if (engine === "near") {
      const tokensRes = await fetch("/api/bridge/near-intents/tokens", {
        headers: authHeaders(auth),
      });
      const tokenList: NearIntentsToken[] = tokensRes.ok ? await tokensRes.json() : [];

      const originAsset = resolveNearAssetId(from.token, from.network, tokenList);
      const destinationAsset = resolveNearAssetId(to.token, to.network, tokenList);

      // NEAR Intents solvers only quote assets they hold inventory in, which leaves real
      // gaps: no USDT on Base, and no Lisk/Celo/Tron at all. Those pairs are still routable
      // through LI.FI's DEX aggregators, so fall back instead of reporting "no rail".
      if (!originAsset || !destinationAsset) {
        return fetchLifiQuote(from, to, rawAmount, evmAddress, slippageBps, auth);
      }

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
      }, auth, { origin: from.decimals, destination: to.decimals });
    }

    return fetchLifiQuote(from, to, rawAmount, evmAddress, slippageBps, auth);
  }, [from, to, amount, evmAddress, starknetAddress, slippageBps, getAccessToken, getInjectedToken]);

  const queryKey = useMemo(
    () => ["bridge-quote", from?.token, from?.network, to?.token, to?.network, amount, evmAddress, starknetAddress, slippageBps],
    [from, to, amount, evmAddress, starknetAddress, slippageBps],
  );

  const addressReady = !from
    ? false
    : from.network === "Starknet"
    ? !!starknetAddress
    : !!evmAddress;

  const { data: quote, isLoading, isFetched, error, refetch } = useQuery({
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
      if (data.kind === "hyperfx-intent") {
        const msLeft = data.expiresAt - Date.now();
        return msLeft > 30_000 ? 30_000 : msLeft > 0 ? msLeft : false;
      }
      // NEAR deposit quotes: stop refetching once the deposit deadline has nearly passed.
      return data.deadline - Date.now() > 30_000 ? 30_000 : false;
    },
  });

  // `isFetched` distinguishes "both engines resolved to no route" from "the query never ran"
  // (disabled: unauthenticated, or wallet address not ready). Only the former is a dead route.
  return { quote: quote ?? null, isLoading, isFetched, error, refetch };
}

// ============================================================================
// useBridgeStatus
// ============================================================================

interface UseBridgeStatusParams {
  engine: BridgeEngine | null;
  refId: string | null; // depositAddress for NEAR, txHash for LI.FI
  enabled: boolean;
  getAccessToken?: () => Promise<string | null>; // for the auth-gated bridge proxy
  /** Injected-wallet SIWE session token getter (passive — polling never prompts). */
  getInjectedToken?: () => Promise<string | null>;
}

export function useBridgeStatus({ engine, refId, enabled, getAccessToken, getInjectedToken }: UseBridgeStatusParams) {
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
        const injectedToken = (await getInjectedToken?.()) ?? null;
        const auth: BridgeAuth = injectedToken
          ? { injectedToken }
          : { token: (await getAccessToken?.()) ?? null };
        const status =
          engine === "near"
            ? await nearClient.getStatus(refId, auth)
            : engine === "hyperfx"
              ? await hyperfxClient.getStatus(refId, auth)
              : await lifiClient.getStatus(refId, auth);

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
  }, [engine, refId, enabled, stop, getAccessToken, getInjectedToken]);

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
  // Injected-wallet execution: the wallet signs and pays for its own txs (no
  // sponsored bundler / EIP-7702 delegation, which are Privy-embedded only).
  isInjectedWallet?: boolean;
  injectedProvider?: { request: (args: { method: string; params?: any[] }) => Promise<any> } | null;
  injectedAddress?: string | null;
  /**
   * Injected-wallet SIWE session token getter for the auth-gated bridge proxy
   * (fresh deposit-address fetch). Interactive-capable: executing is a user
   * action, so re-prompting on an expired session is acceptable here.
   */
  getInjectedToken?: () => Promise<string | null>;
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
  isInjectedWallet,
  injectedProvider,
  injectedAddress,
  getInjectedToken,
}: UseBridgeExecuteParams = {}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Use a ref so the execute callback always reads the latest selectedNetwork
  // without needing it as a useCallback dependency (avoids stale closure).
  const selectedNetworkRef = useRef(selectedNetwork);
  useEffect(() => { selectedNetworkRef.current = selectedNetwork; }, [selectedNetwork]);

  // Injected wallets sign and pay for their own transactions directly through
  // their provider — no sponsored bundler, no EIP-7702 delegation. Calls are sent
  // sequentially, each confirmed before the next, so an approval lands before the
  // swap that depends on it. Returns the last tx hash (the swap/transfer).
  const executeInjectedCalls = useCallback(
    async (
      chainId: number,
      calls: Array<{ to: string; value?: bigint; data: string }>,
    ): Promise<string> => {
      if (!injectedProvider || !injectedAddress) {
        throw new Error("Injected wallet not connected");
      }
      const chain = selectedNetworkRef.current?.chain as any;
      if (!chain) throw new Error("Selected network not found");

      // Ensure the wallet is on the origin chain before sending.
      try {
        await injectedProvider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${chainId.toString(16)}` }],
        });
      } catch {
        throw new Error("Please switch your wallet to the origin network and retry.");
      }

      const publicClient = createPublicClient({
        chain,
        transport: http(getRpcUrl(chain.name)),
      });

      let lastHash = "";
      for (const call of calls) {
        // Only append the Base builder-code suffix to real contract-call data.
        // A bare native transfer (data "0x") stays bare — appending calldata could
        // revert a transfer to a contract deposit address without a matching fallback.
        const hasCallData = !!call.data && call.data !== "0x";
        const data = hasCallData
          ? appendBaseBuilderCode(chainId, call.data as `0x${string}`)
          : "0x";
        const hash = (await injectedProvider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: injectedAddress,
              to: call.to,
              data,
              ...(call.value && call.value > BigInt(0)
                ? { value: `0x${call.value.toString(16)}` }
                : {}),
            },
          ],
        })) as `0x${string}`;
        await publicClient.waitForTransactionReceipt({ hash });
        lastHash = hash;
      }
      return lastHash;
    },
    [injectedProvider, injectedAddress],
  );

  const execute = useCallback(
    async (quote: BridgeQuote, from: BridgeLeg): Promise<{ txHash: string; depositRefId: string }> => {
      setIsLoading(true);
      setError(null);

      try {
        if (quote.kind === "near-deposit") {
          // Injected wallets authenticate the proxy via the x-injected-token
          // session JWT; Privy via Bearer.
          const injectedToken = isInjectedWallet
            ? ((await getInjectedToken?.()) ?? null)
            : null;
          const proxyAuth: BridgeAuth = injectedToken
            ? { injectedToken }
            : { token: (await getAccessToken?.()) ?? null };
          // Dry quotes have no deposit address — fetch a fresh non-dry quote to get one.
          const depositAddress =
            quote.depositAddress ||
            (await nearClient.getDepositAddress(quote, proxyAuth));
          const token = from.token;

          // Injected EVM wallet: sign + pay the deposit transfer directly.
          if (isInjectedWallet && from.network !== "Starknet") {
            const chainId = Number(from.chainId);
            const isNative =
              !from.tokenAddress || from.tokenAddress === ZERO_ADDRESS;
            const call = isNative
              ? { to: depositAddress, value: BigInt(from.rawAmount), data: "0x" }
              : {
                  to: from.tokenAddress,
                  value: BigInt(0),
                  data: encodeFunctionData({
                    abi: erc20Abi,
                    functionName: "transfer",
                    args: [depositAddress as `0x${string}`, BigInt(from.rawAmount)],
                  }),
                };
            const evmHash = await executeInjectedCalls(chainId, [call]);
            setTxHash(evmHash);
            setIsSuccess(true);
            onSuccess?.(evmHash);
            return { txHash: evmHash, depositRefId: depositAddress };
          }

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
            // a same-symbol token from a different network (e.g. Polygon USDC vs BSC USDC).
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
          // LI.FI: optional ERC-20 approval + swap. Injected wallets send them
          // directly; Privy wallets batch them through the sponsored 7702 executor.
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

          // Injected EVM wallet: sign + pay approval and swap directly (sequential).
          if (isInjectedWallet) {
            const chainId = Number(from.chainId);
            const evmHash = await executeInjectedCalls(
              chainId,
              calls.map((c) => ({ to: c.to, value: c.value, data: c.data })),
            );
            setTxHash(evmHash);
            setIsSuccess(true);
            onSuccess?.(evmHash);
            return { txHash: evmHash, depositRefId: evmHash };
          }

          // Privy embedded wallet: sponsored 7702 batch execution.
          if (!embeddedWallet || !signDelegationAuthorization || !getAccessToken) {
            throw new Error("EVM wallet not configured for LI.FI execution");
          }

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
        } else if (quote.kind === "hyperfx-intent") {
          const walletAddr = (isInjectedWallet ? injectedAddress : embeddedWallet?.address) as
            | `0x${string}`
            | undefined;
          if (!walletAddr) {
            throw new Error("EVM wallet not connected");
          }

          const { runHyperfxSwap } = await import("@/app/lib/hyperfx");
          type Hex = `0x${string}`;

          const signTransaction = async (tx: {
            to: Hex;
            data: Hex;
            value: bigint;
          }): Promise<Hex> => {
            const valueHex =
              tx.value > BigInt(0) ? (`0x${tx.value.toString(16)}` as Hex) : ("0x0" as Hex);

            if (isInjectedWallet && injectedProvider && injectedAddress) {
              await injectedProvider.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: `0x${quote.chainId.toString(16)}` }],
              });
              return (await injectedProvider.request({
                method: "eth_sendTransaction",
                params: [
                  {
                    from: injectedAddress,
                    to: tx.to,
                    data: tx.data,
                    value: valueHex,
                  },
                ],
              })) as Hex;
            }

            if (!embeddedWallet) {
              throw new Error("EVM wallet not configured for HyperFX");
            }
            await embeddedWallet.switchChain(quote.chainId);
            const provider = await embeddedWallet.getEthereumProvider();
            return (await provider.request({
              method: "eth_sendTransaction",
              params: [
                {
                  from: embeddedWallet.address,
                  to: tx.to,
                  data: tx.data,
                  value: valueHex,
                },
              ],
            })) as Hex;
          };

          const executeSponsoredBatch =
            !isInjectedWallet && embeddedWallet && signDelegationAuthorization && getAccessToken
              ? async (calls: BatchCall[], gasLimit?: number): Promise<Hex> => {
                  const chain = selectedNetworkRef.current?.chain;
                  if (!chain) {
                    throw new Error("Selected network not found");
                  }
                  await embeddedWallet!.switchChain(quote.chainId);
                  const hash = await executeBatchCalls({
                    chain: chain as any,
                    calls,
                    getAccessToken: getAccessToken!,
                    embeddedWallet: embeddedWallet!,
                    signDelegationAuthorization: signDelegationAuthorization!,
                    gasLimit: gasLimit ?? 1_500_000,
                  });
                  return hash as Hex;
                }
              : undefined;

          const executeSponsoredCall = executeSponsoredBatch
            ? async (call: BatchCall, gasLimit?: number): Promise<Hex> =>
                executeSponsoredBatch([call], gasLimit)
            : undefined;

          const switchChain = async (chainId: number) => {
            if (isInjectedWallet && injectedProvider) {
              await injectedProvider.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: `0x${chainId.toString(16)}` }],
              });
              return;
            }
            if (embeddedWallet) {
              await embeddedWallet.switchChain(chainId);
            }
          };

          const { placementTxHash } = await runHyperfxSwap(quote, {
            address: walletAddr,
            chainId: quote.chainId,
            signTransaction,
            executeSponsoredCall,
            executeSponsoredBatch,
            switchChain,
          });

          setTxHash(placementTxHash);
          setIsSuccess(true);
          onSuccess?.(placementTxHash);
          return { txHash: placementTxHash, depositRefId: placementTxHash };
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
    [onSuccess, onError, getAccessToken, starknetWallet, embeddedWallet, allTokens, signDelegationAuthorization, isInjectedWallet, executeInjectedCalls, getInjectedToken],
  );

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
    setTxHash(null);
    setIsSuccess(false);
  }, []);

  return { execute, isLoading, error, txHash, isSuccess, reset };
}
