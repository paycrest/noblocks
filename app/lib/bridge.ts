/**
 * Bridge implementation - consolidated module
 * Types, routing logic, asset mapping, and engine clients
 */

import axios from "axios";
import { encodeFunctionData, parseUnits, formatUnits, http, createPublicClient, erc20Abi } from "viem";
import type { SignedAuthorization } from "viem";
import { networks } from "@/app/mocks";
import type { Token, Network } from "@/app/types";
import type { BatchCall } from "./providerBatch";
import { buildBatchDigest, encodeExecuteBatch, readBatchNonce } from "./providerBatch";
import { getRpcUrl } from "@/app/utils";
import { getDelegationContractAddress } from "./config";
import { get7702AuthorizedImplementationForAddress } from "../hooks/useEIP7702Account";

// ============================================================================
// TYPES
// ============================================================================

/** Token/chain identifiers for a single bridge leg */
export interface BridgeLeg {
  network: string; // normalized network name, e.g. "Base", "Polygon"
  chainId: number | string; // numeric for EVM, string for Starknet
  token: string; // symbol: "USDC", "cNGN"
  tokenAddress: string;
  decimals: number;
  amount: string; // human-readable string, e.g. "100.00"
  rawAmount: string; // base units as string
}

export interface BridgeQuoteRequest {
  from: BridgeLeg;
  to: BridgeLeg;
  sender: string; // user's wallet address
  slippageBps?: number;
}

/** NEAR Intents 1Click quote — deposit-address model */
export interface NearDepositQuote {
  kind: "near-deposit";
  depositAddress: string; // empty on dry quotes; call getDepositAddress() before executing
  amountOut: string;
  deadline: number; // unix timestamp ms
  timeEstimate: string; // e.g. "~30 seconds"
  fee: string;
  raw: unknown; // original API response
}

/** LI.FI quote — approve+tx model */
export interface LifiTxQuote {
  kind: "lifi-tx";
  amountOut: string; // human-readable
  /** Consolidated total of all (already-included) fees, expressed in the receiving token. */
  feeReceivingToken: string;
  estimate: {
    fromAmount: string; // human-readable
    toAmount: string; // human-readable
    approvalAddress: string;
    executionDuration: string;
    feeCosts: Array<{ name: string; amount: string; token?: { symbol: string; decimals: number } }>;
  };
  transactionRequest: {
    to: string;
    data: string;
    value: string;
    gasLimit?: string;
  };
  raw: unknown;
}

export type BridgeQuote = NearDepositQuote | LifiTxQuote;

export type BridgeStatus =
  | "PENDING_DEPOSIT"
  | "KNOWN_DEPOSIT_TX"
  | "PROCESSING"
  | "SUCCESS"
  | "REFUNDED"
  | "FAILED";

export interface BridgeStatusResult {
  status: BridgeStatus;
  txHash?: string;
  destinationTxHash?: string;
}

export type BridgeEngine = "near" | "lifi";

// ============================================================================
// ROUTING
// ============================================================================

/**
 * Routes to LI.FI for cNGN legs or any Starknet leg; NEAR Intents otherwise (EVM↔EVM stablecoins).
 * Starknet uses LI.FI because NEAR Intents' token list only includes STRK/ZEC/XRP on Starknet —
 * no USDC/stablecoins — so stablecoin routes via NEAR always fail asset resolution.
 */
export function selectEngine(from: BridgeLeg, to: BridgeLeg): BridgeEngine {
  const cngn = "cngn";
  const isStarknet = (n: string) => n.toLowerCase() === "starknet";
  if (from.token.toLowerCase() === cngn || to.token.toLowerCase() === cngn) return "lifi";
  if (isStarknet(from.network) || isStarknet(to.network)) return "lifi";
  return "near";
}

/**
 * Returns true when a route between `from` and `to` is supported.
 * Starknet legs are unsupported: NEAR Intents only has STRK/ZEC/XRP (no stablecoins),
 * and LI.FI has no Starknet chain support at all.
 */
export function isRouteSupported(from: BridgeLeg, to: BridgeLeg): boolean {
  const isStarknet = (n: string) => n.toLowerCase() === "starknet";
  if (isStarknet(from.network) || isStarknet(to.network)) return false;
  return true;
}

// ============================================================================
// ASSET MAPPING
// ============================================================================

const LIFI_CHAIN_MAP: Record<string, number> = {};
for (const n of networks) {
  if (typeof n.chain.id === "number") {
    LIFI_CHAIN_MAP[n.chain.name] = n.chain.id;
  }
}

export function toLifiChainId(networkName: string): number | null {
  return LIFI_CHAIN_MAP[networkName] ?? null;
}

/** Maps our internal network names to NEAR Intents blockchain identifiers */
const NEAR_CHAIN_MAP: Record<string, string> = {
  "Ethereum": "eth",
  "BNB Smart Chain": "bsc",
  "Arbitrum One": "arb",
  "Base": "base",
  "OP Mainnet": "op",
  "Optimism": "op",
  "Polygon": "pol",
  "Polygon PoS": "pol",
  "Starknet": "starknet",
  "Scroll": "scroll",
  "Solana": "sol",
  "Avalanche": "avax",
};

export interface NearIntentsToken {
  assetId: string;
  symbol: string;
  blockchain: string;
  decimals: number;
  contractAddress?: string;
}

/**
 * Look up the NEAR Intents assetId for a given token+network from the live token list.
 * 1. Exact symbol match (USDC → USDC)
 * 2. Prefix match — NEAR's symbol starts with ours (USDT → USDT0, USDT.e, …)
 *    Only accepted when exactly one token on the chain matches, to avoid ambiguity.
 * Returns null if unsupported or ambiguous.
 */
export function resolveNearAssetId(
  tokenSymbol: string,
  networkName: string,
  tokenList: NearIntentsToken[],
): string | null {
  const nearChain = NEAR_CHAIN_MAP[networkName];
  if (!nearChain) return null;

  const sym = tokenSymbol.toUpperCase();
  const onChain = tokenList.filter((t) => t.blockchain === nearChain);

  const exact = onChain.find((t) => t.symbol.toUpperCase() === sym);
  if (exact) return exact.assetId;

  const prefixed = onChain.filter((t) => t.symbol.toUpperCase().startsWith(sym));
  if (prefixed.length === 1) return prefixed[0].assetId;

  return null;
}

/**
 * Get token address and decimals for a given symbol+network from the tokens map.
 * Computed at call time from the live useTokens() data.
 */
export function getTokenMeta(
  tokenSymbol: string,
  networkName: string,
  allTokens: Record<string, Token[]>,
): { address: string; decimals: number } | null {
  const tokens = allTokens[networkName];
  if (!tokens) return null;
  const t = tokens.find(
    (t) => t.symbol.toLowerCase() === tokenSymbol.toLowerCase(),
  );
  if (!t) return null;
  return { address: t.address || "", decimals: t.decimals };
}

/**
 * Convert a human-readable amount to base units for the given decimals.
 */
export function toRawAmount(amount: string, decimals: number): string {
  // Use viem's parseUnits — the same base-unit conversion the rest of the app uses
  // (useSmartWalletTransfer etc.) instead of a divergent hand-rolled string split.
  try {
    return parseUnits(amount, decimals).toString();
  } catch {
    return "0";
  }
}

/**
 * Total conversion fee expressed in the *receiving* token, for the single NUMERIC `fee`
 * column on the transactions table. LI.FI fees come in mixed tokens and are all `included`
 * (already deducted from the amount received); we consolidate them to one USD total and
 * convert to the receiving token (see LifiClient.getQuote). NEAR exposes one fee value.
 */
export function bridgeFeeInReceivingToken(quote: BridgeQuote): number {
  if (quote.kind === "lifi-tx") {
    return parseFloat(quote.feeReceivingToken) || 0;
  }
  return parseFloat(quote.fee) || 0;
}

// ============================================================================
// ENGINE CLIENTS
// ============================================================================

type NearQuoteParams = {
  dry: boolean;
  swapType: "EXACT_INPUT" | "EXACT_OUTPUT";
  slippageTolerance: number;
  originAsset: string;
  destinationAsset: string;
  amount: string;
  recipient: string;
  recipientType: "ORIGIN_CHAIN" | "INTENTS" | "CONFIDENTIAL_INTENTS" | "DESTINATION_CHAIN";
  refundTo: string;
  refundType: "ORIGIN_CHAIN" | "INTENTS" | "CONFIDENTIAL_INTENTS" | "DESTINATION_CHAIN";
  deadline: string;
  depositType: "ORIGIN_CHAIN" | "INTENTS" | "CONFIDENTIAL_INTENTS" | "DESTINATION_CHAIN";
};

/** Bearer header for the auth-gated bridge proxy routes; empty when no token (route then 401s). */
function authHeaders(token?: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export class NearIntentsClient {
  private normalizeQuote(data: any, params: NearQuoteParams): NearDepositQuote {
    const q = data.quote ?? data; // response nests amounts under data.quote
    const secs: number = q.timeEstimate ?? 30;
    return {
      kind: "near-deposit",
      depositAddress: data.quote?.depositAddress ?? data.depositAddress ?? "",
      amountOut: q.amountOutFormatted ?? String(q.amountOut ?? "0"),
      deadline: data.quote?.deadline
        ? new Date(data.quote.deadline).getTime()
        : Date.now() + 600_000,
      timeEstimate: `~${secs} seconds`,
      fee: q.withdrawFee ?? q.refundFee ?? "0",
      raw: data,
      _params: params,
    } as NearDepositQuote & { _params: NearQuoteParams };
  }

  async getQuote(params: NearQuoteParams, token?: string | null): Promise<BridgeQuote> {
    const { data } = await axios.post("/api/bridge/near-intents/quote", params, {
      headers: authHeaders(token),
    });
    return this.normalizeQuote(data, params);
  }

  /** Re-requests with dry:false to get the real deposit address for execution. */
  async getDepositAddress(quote: NearDepositQuote, token?: string | null): Promise<string> {
    const params = (quote as any)._params as NearQuoteParams | undefined;
    if (!params) throw new Error("Quote missing original params — cannot fetch deposit address");
    const freshParams: NearQuoteParams = {
      ...params,
      dry: false,
      deadline: new Date(Date.now() + 600_000).toISOString(),
    };
    const { data } = await axios.post("/api/bridge/near-intents/quote", freshParams, {
      headers: authHeaders(token),
    });
    // 1Click nests the address under data.quote.depositAddress (same shape normalizeQuote
    // defends against) — reading only data.depositAddress misses it and throws spuriously.
    const addr = data.quote?.depositAddress ?? data.depositAddress;
    if (!addr) throw new Error("NEAR Intents did not return a deposit address");
    return addr;
  }

  async getStatus(depositAddress: string, token?: string | null): Promise<BridgeStatusResult> {
    const { data } = await axios.get("/api/bridge/near-intents/status", {
      params: { depositAddress },
      headers: authHeaders(token),
    });
    return {
      status: data.status,
      txHash: data.txHash,
      destinationTxHash: data.destinationTxHash,
    };
  }
}

/**
 * Map LI.FI's status/substatus enum to our internal BridgeStatus.
 * LI.FI status: NOT_FOUND | PENDING | DONE | FAILED. Success is "DONE" (not "SUCCESS"),
 * and refunds surface via the substatus (REFUNDED / REFUND_IN_PROGRESS) — passing
 * data.status through unmapped meant DONE never matched the SUCCESS terminal check,
 * so completed LI.FI bridges polled forever and never finalized.
 */
export function mapLifiStatus(status?: string, substatus?: string): BridgeStatus {
  const sub = (substatus ?? "").toUpperCase();
  if (sub === "REFUNDED" || sub === "REFUND_IN_PROGRESS") return "REFUNDED";
  switch ((status ?? "").toUpperCase()) {
    case "DONE":
      return "SUCCESS";
    case "FAILED":
      return "FAILED";
    case "PENDING":
    case "NOT_FOUND":
    default:
      return "PROCESSING";
  }
}

export class LifiClient {
  async getQuote(params: {
    fromChain: number;
    toChain: number;
    fromToken: string;
    toToken: string;
    fromAmount: string;
    fromAddress: string;
    toAddress: string;
    slippage?: number;
  }, token?: string | null): Promise<BridgeQuote | null> {
    const { data, status } = await axios.get("/api/bridge/lifi/quote", {
      params,
      headers: authHeaders(token),
      validateStatus: () => true,
    });
    // Unsupported route/token — return null so the UI shows "no rail available"
    if (status === 404) return null;
    // Auth/rate-limit failures are actionable, not "no route" — surface them.
    if (status === 401 || status === 403) {
      throw new Error("Authentication required for bridge quote");
    }
    if (status === 429) {
      throw new Error("LI.FI quote rate-limited. Please retry shortly.");
    }
    if (status >= 400 && status < 500) return null;
    if (status >= 500) throw new Error(data?.message || `LI.FI service error (${status})`);

    // Extract token info from the response
    const fromTokenInfo = data.action?.fromToken;
    const toTokenInfo = data.action?.toToken;
    const fromDecimals = fromTokenInfo?.decimals ?? 18;
    const toDecimals = toTokenInfo?.decimals ?? 18;

    // Convert raw base-unit amounts to human-readable.
    // Use viem's formatUnits (bigint-based) — parseInt/Math.pow silently lose
    // precision for amounts above 2^53 wei (~9 tokens at 18 decimals).
    const formatAmount = (rawAmount: string, decimals: number): string => {
      if (!rawAmount || rawAmount === "0") return "0";
      try {
        return formatUnits(BigInt(rawAmount), decimals);
      } catch {
        return "0";
      }
    };

    // All LI.FI feeCosts are `included` (already deducted from toAmount). Consolidate them
    // into one figure: sum their USD value, then convert to the receiving token using its
    // USD price, so the displayed/stored fee is in the same unit the user receives.
    const totalFeeUsd = (data.estimate?.feeCosts ?? []).reduce(
      (sum: number, f: any) => sum + (Number(f.amountUSD) || 0),
      0,
    );
    const toPriceUsd = Number(toTokenInfo?.priceUSD) || 0;
    const feeReceivingToken =
      toPriceUsd > 0 ? (totalFeeUsd / toPriceUsd).toString() : "0";

    return {
      kind: "lifi-tx",
      amountOut: formatAmount(data.estimate?.toAmount ?? "0", toDecimals),
      feeReceivingToken,
      estimate: {
        fromAmount: formatAmount(data.estimate?.fromAmount ?? params.fromAmount, fromDecimals),
        toAmount: formatAmount(data.estimate?.toAmount ?? "0", toDecimals),
        approvalAddress: data.estimate?.approvalAddress ?? "",
        executionDuration: data.estimate?.executionDuration ?? "",
        feeCosts: (data.estimate?.feeCosts ?? []).map((fee: any) => ({
          name: fee.name,
          amount: formatAmount(fee.amount, fee.token?.decimals ?? 18),
          token: fee.token,
        })),
      },
      transactionRequest: data.transactionRequest ?? { to: "", data: "0x", value: "0" },
      raw: data,
    };
  }

  async getStatus(txHash: string, token?: string | null): Promise<BridgeStatusResult> {
    const { data } = await axios.get("/api/bridge/lifi/status", {
      params: { txHash },
      headers: authHeaders(token),
    });
    return {
      status: mapLifiStatus(data.status, data.substatus),
      txHash: data.txHash,
      destinationTxHash: data.receiving?.txHash,
    };
  }
}

// ============================================================================
// EVM BATCH EXECUTION
// ============================================================================

interface EmbeddedWalletLike {
  switchChain: (chainId: number) => Promise<void>;
  getEthereumProvider: () => Promise<any>;
  address: string;
}

export interface ExecuteBatchCallsParams {
  chain: Network["chain"];
  calls: BatchCall[];
  getAccessToken: () => Promise<string | null>;
  embeddedWallet: EmbeddedWalletLike;
  signDelegationAuthorization: (chainId: number) => Promise<SignedAuthorization>;
  /** Optional gas override (LI.FI swaps need more than the bundler default). */
  gasLimit?: number;
}

/**
 * Core sponsored EIP-7702 batch execution: delegation detection, batch-digest signing,
 * and bundler submission for an arbitrary set of prebuilt calls. Both the simple transfer
 * path (evmBatchExecute) and the LI.FI approve+swap path build their calls and delegate here,
 * so the 7702/nonce/signature/bundler protocol lives in exactly one place.
 */
export async function executeBatchCalls({
  chain,
  calls,
  getAccessToken,
  embeddedWallet,
  signDelegationAuthorization,
  gasLimit,
}: ExecuteBatchCallsParams): Promise<string> {
  const chainId =
    typeof chain.id === "number" ? chain.id : parseInt(String(chain.id));
  await embeddedWallet.switchChain(chainId);
  const provider = await embeddedWallet.getEthereumProvider();
  const rpcUrl = getRpcUrl(chain.name);
  if (!rpcUrl) {
    throw new Error(`RPC URL not configured for ${chain.name}.`);
  }

  const accountAddress = embeddedWallet.address as `0x${string}`;

  const delegationContractAddress = getDelegationContractAddress(chainId);
  if (!delegationContractAddress || delegationContractAddress === "") {
    throw new Error(
      `Delegation contract not configured for ${chain.name}. Set the contract for chain ${chainId}.`
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
  const needsDelegation =
    !currentImplementation ||
    currentImplementation.toLowerCase() !== expectedDelegation;

  let authorization: SignedAuthorization | undefined;
  if (needsDelegation) {
    authorization = await signDelegationAuthorization(chainId);
  }

  const nonce = await readBatchNonce(publicClient, accountAddress).catch(() => BigInt(0));
  const digest = buildBatchDigest(nonce, calls);
  const rawSignature = (await provider.request({
    method: "personal_sign",
    params: [digest, accountAddress],
  })) as string;
  const signature = (rawSignature.startsWith("0x") ? rawSignature : `0x${rawSignature}`) as `0x${string}`;

  const callData = encodeExecuteBatch(calls, signature);
  const payload = {
    chainId,
    rpcUrl,
    accountAddress,
    callData,
    delegationContractAddress,
    ...(gasLimit != null && { gasLimit }),
    ...(authorization != null && { eip7702Authorization: authorization }),
  };

  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error("Authentication required. Please sign in to complete this transfer.");
  }

  const res = await fetch("/api/bundler/execute-sponsored", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  });

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
  const hash = data.transactionHash;
  if (!hash) throw new Error("No transaction hash returned");

  return hash;
}

export interface EvmBatchExecuteParams {
  chain: Network["chain"];
  token: string;
  amount: string;
  recipientAddress: string;
  supportedTokens: Token[];
  getAccessToken: () => Promise<string | null>;
  embeddedWallet: EmbeddedWalletLike;
  signDelegationAuthorization: (chainId: number) => Promise<SignedAuthorization>;
}

/**
 * Execute a single sponsored EVM transfer (native or ERC-20) via the bundler.
 * Builds the transfer call and delegates the 7702/bundler protocol to executeBatchCalls.
 */
export async function evmBatchExecute({
  chain,
  token,
  amount,
  recipientAddress,
  supportedTokens,
  getAccessToken,
  embeddedWallet,
  signDelegationAuthorization,
}: EvmBatchExecuteParams): Promise<string> {
  // Filter to EVM tokens only (address is empty for native or 42 chars "0x"+20bytes).
  // Starknet/Solana tokens share symbols with EVM tokens but have 66-char addresses.
  const tokenData = supportedTokens.find(
    (t) =>
      t.symbol.toUpperCase() === token.toUpperCase() &&
      (t.address === "" || (t.address.startsWith("0x") && t.address.length === 42))
  );

  const call: BatchCall =
    tokenData?.isNative && tokenData?.address === ""
      ? {
          to: recipientAddress as `0x${string}`,
          value: parseUnits(amount, tokenData.decimals ?? 18),
          data: "0x",
        }
      : (() => {
          const tokenAddress = tokenData?.address as `0x${string}` | undefined;
          const tokenDecimals = tokenData?.decimals;
          if (!tokenAddress || tokenDecimals === undefined) {
            throw new Error(`Token data not found for ${token}.`);
          }
          return {
            to: tokenAddress,
            value: BigInt(0),
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "transfer",
              args: [
                recipientAddress as `0x${string}`,
                parseUnits(amount, tokenDecimals),
              ],
            }),
          };
        })();

  return executeBatchCalls({
    chain,
    calls: [call],
    getAccessToken,
    embeddedWallet,
    signDelegationAuthorization,
  });
}
