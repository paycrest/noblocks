/**
 * Client-side HyperFX (Hyperbridge IntentGateway) swap execution.
 * Loaded dynamically from useBridgeExecute to keep the SDK out of unrelated bundles.
 */

import {
  EvmChain,
  IntentGateway,
  IntentGatewayABI,
  IntentsCoprocessor,
  IntentOrderStatus,
  createQueryClient,
  orderCommitment,
  type DecodedOrderPlacedLog,
  type Order,
} from "@hyperbridge/sdk";
import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  http,
  padHex,
  parseEventLogs,
  stringToHex,
  zeroAddress,
  zeroHash,
  type Hex,
} from "viem";
import { appendBaseBuilderCode } from "@/app/lib/baseBuilderCode";
import type { BatchCall } from "@/app/lib/providerBatch";
import { getRpcUrl, resolveHyperfxBundlerUrl } from "@/app/utils";
import {
  HYPERFX_CHAIN_ID_BY_NETWORK,
  HYPERFX_VIEM_CHAIN_BY_NETWORK,
} from "@/app/lib/hyperfxNetworks";
import {
  HYPERFX_GATEWAY_BY_NETWORK,
  orderFromOrderPlacedLog,
  resolveHyperfxOrderStatus,
} from "@/app/lib/hyperfxStatus";
import type { HyperfxIntentQuote } from "./bridge";

const WS_URL =
  process.env.NEXT_PUBLIC_HYPERBRIDGE_WS_URL ||
  process.env.HYPERBRIDGE_WS_URL ||
  "wss://nexus.rpc.polytope.technology";
const INDEXER_URL =
  process.env.NEXT_PUBLIC_HYPERBRIDGE_INDEXER_URL ||
  process.env.HYPERBRIDGE_INDEXER_URL ||
  "https://nexus.indexer.polytope.technology";

const NOBLOCKS_GRAFFITI = padHex(stringToHex("noblocks.xyz"), {
  size: 32,
  dir: "right",
});

export type HyperfxWallet = {
  address: `0x${string}`;
  chainId: number;
  /** Injected wallets: direct eth_sendTransaction (with Base builder code applied). */
  signTransaction?: (tx: {
    to: Hex;
    data: Hex;
    value: bigint;
  }) => Promise<Hex>;
  /**
   * Privy embedded wallets: sponsored EIP-7702 batch for a single call.
   * Raw eth_sendTransaction corrupts ERC-20 approve calldata via Privy dataSuffix.
   */
  executeSponsoredCall?: (
    call: BatchCall,
    gasLimit?: number,
  ) => Promise<Hex>;
  /** Privy embedded: sponsored batch with multiple calls (approve + placeOrder). */
  executeSponsoredBatch?: (
    calls: BatchCall[],
    gasLimit?: number,
  ) => Promise<Hex>;
  switchChain?: (chainId: number) => Promise<void>;
};

async function sendOnChainCall(
  wallet: HyperfxWallet,
  tx: { to: Hex; data: Hex; value: bigint },
  options: { gasLimit?: number; routing: "sponsored" | "direct" },
): Promise<Hex> {
  if (options.routing === "sponsored" && wallet.executeSponsoredCall) {
    return wallet.executeSponsoredCall(
      { to: tx.to, value: tx.value, data: tx.data },
      options.gasLimit,
    );
  }
  if (!wallet.signTransaction) {
    throw new Error("Wallet not configured for HyperFX execution");
  }
  // Injected wallets append builder code manually; Privy adds dataSuffix via plugin.
  const data = wallet.executeSponsoredBatch || wallet.executeSponsoredCall
    ? tx.data
    : appendBaseBuilderCode(wallet.chainId, tx.data);
  return wallet.signTransaction({ to: tx.to, data, value: tx.value });
}

export type HyperfxSwapResult = {
  placementTxHash: string;
  /** Same as placement until fill is detected via on-chain status polling. */
  fillTxHash: string;
};

export type HyperfxBridgeStatus = "SUCCESS" | "PROCESSING" | "REFUNDED" | "FAILED";

export type HyperfxStatusResult = {
  status: HyperfxBridgeStatus;
  txHash: string;
  destinationTxHash?: string;
};

const hyperfxOrderKey = (txHash: string) => `hyperfx-order-${txHash}`;

const INTENT_GATEWAY_ABI =
  (IntentGatewayABI as { ABI?: typeof IntentGatewayABI }).ABI ??
  IntentGatewayABI;

/** SDK `getOrderPlacedFromTx` uses a stale ABI and misses V2 OrderPlaced logs. */
function parseOrderPlacedFromReceipt(
  logs: Awaited<
    ReturnType<ReturnType<typeof createPublicClient>["getTransactionReceipt"]>
  >["logs"],
  gatewayAddress: string,
): DecodedOrderPlacedLog | undefined {
  const gateway = gatewayAddress.toLowerCase();
  const events = parseEventLogs({
    abi: INTENT_GATEWAY_ABI,
    logs: logs.filter((log) => log.address.toLowerCase() === gateway),
  });
  return events.find((event) => event.eventName === "OrderPlaced") as
    | DecodedOrderPlacedLog
    | undefined;
}

const HYPERFX_GATEWAY = HYPERFX_GATEWAY_BY_NETWORK;

function createNetworkPublicClient(network: string) {
  const rpcUrl = getRpcUrl(network);
  const chain = HYPERFX_VIEM_CHAIN_BY_NETWORK[network];
  if (!rpcUrl || !chain) return null;
  return createPublicClient({ chain, transport: http(rpcUrl) });
}

function markHyperfxTerminal(
  placementTxHash: string,
  outcome: "settled" | "expired" | "refunded" | "failed",
  fillTxHash?: string,
): void {
  if (typeof window === "undefined") return;
  if (outcome === "settled") {
    sessionStorage.setItem(
      `hyperfx-settled-${placementTxHash}`,
      fillTxHash ?? placementTxHash,
    );
    sessionStorage.removeItem(`hyperfx-failed-${placementTxHash}`);
    return;
  }
  const reason =
    outcome === "refunded" ? "refunded" : outcome === "expired" ? "expired" : "failed";
  sessionStorage.setItem(`hyperfx-failed-${placementTxHash}`, reason);
}

function orderToStoredJson(order: Order): unknown {
  return JSON.parse(
    JSON.stringify(order, (_, value) =>
      typeof value === "bigint" ? { __bigint: value.toString() } : value,
    ),
  );
}

function orderFromStoredJson(value: unknown): Order {
  const order = JSON.parse(JSON.stringify(value), (_, v) =>
    v && typeof v === "object" && v !== null && "__bigint" in v
      ? BigInt(v.__bigint as string)
      : v,
  ) as Order;
  return { ...order, id: order.id ?? orderCommitment(order) };
}

function suppressBidManagerConsoleLogs(): () => void {
  const prev = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };
  const filter =
    (fn: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      if (String(args[0] ?? "").includes("[BidManager]")) return;
      fn(...args);
    };
  console.log = filter(prev.log);
  console.warn = filter(prev.warn);
  console.error = filter(prev.error);
  return () => {
    console.log = prev.log;
    console.warn = prev.warn;
    console.error = prev.error;
  };
}

async function trackHyperfxFillInBackground(
  run: AsyncIterableIterator<{ status: string; transactionHash?: string; error?: string }>,
  placementTxHash: Hex,
): Promise<void> {
  const restoreConsole = suppressBidManagerConsoleLogs();

  try {
    while (true) {
      const update = await run.next();
      if (update.done) break;
      const { status, transactionHash, error } = update.value as {
        status: string;
        transactionHash?: string;
        error?: string;
      };
      if (status === IntentOrderStatus.BID_SELECTED) {
        markHyperfxTerminal(
          placementTxHash,
          "settled",
          transactionHash ?? placementTxHash,
        );
        // Same-chain: fill may complete without a separate FILLED yield.
        continue;
      }
      if (status === IntentOrderStatus.FILLED) {
        markHyperfxTerminal(
          placementTxHash,
          "settled",
          transactionHash ?? placementTxHash,
        );
        return;
      }
      if (status === IntentOrderStatus.EXPIRED) {
        markHyperfxTerminal(placementTxHash, "expired");
        return;
      }
      if (status === IntentOrderStatus.FAILED) {
        // Doc: retryable — SDK keeps polling until FILLED or EXPIRED.
        console.warn("[HyperFX] Retryable fill failure:", error);
        continue;
      }
    }
  } catch (err) {
    console.warn("[HyperFX] Fill tracking stopped:", err);
    markHyperfxTerminal(
      placementTxHash,
      "failed",
    );
  } finally {
    restoreConsole();
  }
}

export function saveHyperfxPlacedOrder(
  placementTxHash: string,
  network: string,
  chainId: number,
  order: Order,
  placementBlockNumber?: bigint,
): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(
    hyperfxOrderKey(placementTxHash),
    JSON.stringify({
      network,
      chainId,
      order: orderToStoredJson(order),
      ...(placementBlockNumber !== undefined
        ? { placementBlockNumber: placementBlockNumber.toString() }
        : {}),
    }),
  );
}

async function loadHyperfxOrderContext(
  placementTxHash: Hex,
  network: string,
  chainId: number,
): Promise<{ order: Order; placementBlockNumber: bigint } | null> {
  if (typeof window !== "undefined") {
    try {
      const raw = sessionStorage.getItem(hyperfxOrderKey(placementTxHash));
      if (raw) {
        const parsed = JSON.parse(raw) as {
          order?: unknown;
          placementBlockNumber?: string;
        };
        if (parsed.order) {
          const order = orderFromStoredJson(parsed.order);
          const placementBlockNumber = parsed.placementBlockNumber
            ? BigInt(parsed.placementBlockNumber)
            : undefined;
          if (placementBlockNumber !== undefined) {
            return { order, placementBlockNumber };
          }
          return { order, placementBlockNumber: await resolvePlacementBlockNumber(
            placementTxHash,
            network,
          ) };
        }
      }
    } catch {
      // fall through to receipt decode
    }
  }

  const gateway = HYPERFX_GATEWAY[network];
  const publicClient = createNetworkPublicClient(network);
  if (!gateway || !publicClient) return null;

  const receipt = await publicClient.getTransactionReceipt({
    hash: placementTxHash,
  });
  const placedLog = parseOrderPlacedFromReceipt(receipt.logs, gateway);
  if (!placedLog) return null;

  const order = orderFromOrderPlacedLog(placedLog.args);
  saveHyperfxPlacedOrder(
    placementTxHash,
    network,
    chainId,
    order,
    receipt.blockNumber,
  );
  return { order, placementBlockNumber: receipt.blockNumber };
}

async function resolvePlacementBlockNumber(
  placementTxHash: Hex,
  network: string,
): Promise<bigint> {
  const publicClient = createNetworkPublicClient(network);
  if (!publicClient) return BigInt(0);
  const receipt = await publicClient.getTransactionReceipt({ hash: placementTxHash });
  return receipt.blockNumber;
}

/**
 * Resolves HyperFX swap status from on-chain IntentGateway state.
 * Used by status polling when sessionStorage has no terminal result yet.
 */
export async function resolveHyperfxOnChainStatus(
  placementTxHash: string,
): Promise<HyperfxStatusResult> {
  const txHash = placementTxHash;
  let network = "Base";
  let chainId = HYPERFX_CHAIN_ID_BY_NETWORK.Base ?? 8453;

  if (typeof window !== "undefined") {
    try {
      const raw = sessionStorage.getItem(hyperfxOrderKey(placementTxHash));
      if (raw) {
        const parsed = JSON.parse(raw) as { network?: string; chainId?: number };
        if (parsed.network) network = parsed.network;
        if (parsed.chainId) chainId = parsed.chainId;
      }
    } catch {
      // use defaults
    }
  }

  const gateway = HYPERFX_GATEWAY[network];
  const client = createNetworkPublicClient(network);
  if (!gateway || !client) {
    return { status: "PROCESSING", txHash };
  }

  const ctx = await loadHyperfxOrderContext(
    placementTxHash as Hex,
    network,
    chainId,
  );
  if (!ctx) {
    return { status: "PROCESSING", txHash };
  }

  const resolved = await resolveHyperfxOrderStatus(
    client as import("viem").PublicClient,
    gateway,
    ctx.order,
    ctx.placementBlockNumber,
  );

  if (resolved.status === "SUCCESS") {
    const fillTx = resolved.fillTxHash ?? placementTxHash;
    markHyperfxTerminal(placementTxHash, "settled", fillTx);
    return {
      status: "SUCCESS",
      txHash,
      destinationTxHash: fillTx,
    };
  }

  if (resolved.status === "REFUNDED") {
    markHyperfxTerminal(placementTxHash, "refunded");
    return { status: "REFUNDED", txHash };
  }

  if (resolved.status === "FAILED") {
    markHyperfxTerminal(placementTxHash, "expired");
    return { status: "FAILED", txHash };
  }

  return { status: "PROCESSING", txHash };
}

async function createEvmChain(network: string, bundlerUrl: string) {
  const rpcUrl = getRpcUrl(network);
  if (!rpcUrl) {
    throw new Error(`RPC URL not configured for ${network}`);
  }
  return EvmChain.create(rpcUrl, bundlerUrl);
}

async function createExecutionGateway(
  network: string,
  chainId: number,
  bundlerUrl: string,
) {
  const chain = await createEvmChain(network, bundlerUrl);
  const coprocessor = await IntentsCoprocessor.connect(WS_URL);
  const queryClient = createQueryClient({ url: INDEXER_URL });
  const gateway = (
    await IntentGateway.create(chain, chain, coprocessor)
  ).withQueryClient(queryClient);

  return { gateway, chain, chainId };
}

/**
 * Executes a HyperFX intent swap through IntentGateway `executeBest`.
 * Resolves when the order is filled or throws on expiry / hard failure.
 */
export async function runHyperfxSwap(
  quote: HyperfxIntentQuote,
  wallet: HyperfxWallet,
): Promise<HyperfxSwapResult> {
  if (Date.now() > quote.expiresAt) {
    throw new Error("Quote expired. Refresh and try again.");
  }

  if (wallet.switchChain) {
    await wallet.switchChain(quote.chainId);
  }

  const bundlerUrl =
    quote.bundlerUrl?.trim() || (await resolveHyperfxBundlerUrl(quote.network));

  const { gateway, chain } = await createExecutionGateway(
    quote.network,
    quote.chainId,
    bundlerUrl,
  );
  const sourceId = chain.config.stateMachineId;
  const destId = sourceId;
  const sourceGateway = chain.configService.getIntentGatewayAddress(sourceId);

  const order: Order = {
    user: zeroHash,
    source: sourceId,
    destination: destId,
    deadline: (await chain.client.getBlockNumber()) + BigInt(200),
    nonce: BigInt(0),
    fees: BigInt(0),
    session: zeroAddress,
    predispatch: { assets: [], call: "0x" },
    inputs: [
      {
        token: quote.tokenIn as Hex,
        amount: BigInt(quote.rawAmountIn),
      },
    ],
    output: {
      beneficiary: wallet.address,
      assets: [
        {
          token: quote.tokenOut as Hex,
          amount: BigInt(quote.rawAmountOut),
        },
      ],
      call: "0x",
    },
  };

  const { fees } = await gateway.quoteOrderFees(order);
  order.fees = fees;

  const { address: feeTokenAddress } = await chain.getFeeTokenWithDecimals();
  const inputIsFeeToken =
    feeTokenAddress.toLowerCase() === (quote.tokenIn as string).toLowerCase();
  const approvalAmount = inputIsFeeToken
    ? BigInt(quote.rawAmountIn) + fees
    : BigInt(quote.rawAmountIn);

  const publicClient = createNetworkPublicClient(quote.network);
  if (!publicClient) {
    throw new Error(`RPC URL not configured for ${quote.network}`);
  }

  const inputApprovalCall: BatchCall = {
    to: quote.tokenIn as Hex,
    value: BigInt(0),
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [sourceGateway as Hex, approvalAmount],
    }),
  };

  const feeApprovalCall: BatchCall | null = inputIsFeeToken
    ? null
    : {
        to: feeTokenAddress as Hex,
        value: BigInt(0),
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [sourceGateway as Hex, fees],
        }),
      };

  const run = gateway.executeBest(order, NOBLOCKS_GRAFFITI, {
    auctionTimeMs: 15_000,
    pollIntervalMs: 5_000,
  });

  const first = await run.next();
  if (first.done || first.value.status !== IntentOrderStatus.AWAITING_PLACE_ORDER) {
    throw new Error("HyperFX placement transaction unavailable");
  }

  // Fee-token orders (e.g. USDC→cNGN): fee is pulled via ERC-20 allowance in calldata —
  // msg.value is only native-token inputs (`value`). Do not add nativeFee or the batch
  // reverts when the wallet lacks ETH (see SDK AWAITING_PLACE_ORDER docs).
  const placementValue =
    first.value.feeTokenAmount > BigInt(0) &&
    first.value.feeTokenAddress.toLowerCase() !== zeroAddress
      ? first.value.value
      : first.value.value + first.value.nativeFee;

  const placementCall: BatchCall = {
    to: first.value.to as Hex,
    value: placementValue,
    data: first.value.data as Hex,
  };

  const prePlacementCalls = feeApprovalCall
    ? [inputApprovalCall, feeApprovalCall]
    : [inputApprovalCall];

  let placementTxHash: Hex;

  if (wallet.executeSponsoredBatch) {
    // Doc: batched [input approve, fee approve?, placeOrder] in one sponsored EIP-7702 tx.
    placementTxHash = await wallet.executeSponsoredBatch(
      [...prePlacementCalls, placementCall],
      1_500_000,
    );
  } else if (wallet.signTransaction) {
    for (const call of prePlacementCalls) {
      const approvalHash = await sendOnChainCall(wallet, call, {
        gasLimit: 600_000,
        routing: "direct",
      });
      await publicClient.waitForTransactionReceipt({ hash: approvalHash });
    }
    placementTxHash = await sendOnChainCall(wallet, placementCall, {
      gasLimit: 1_000_000,
      routing: "direct",
    });
  } else if (wallet.executeSponsoredCall) {
    for (const call of prePlacementCalls) {
      const approvalHash = await wallet.executeSponsoredCall(call, 600_000);
      await publicClient.waitForTransactionReceipt({ hash: approvalHash });
    }
    placementTxHash = await wallet.executeSponsoredCall(placementCall, 1_000_000);
  } else {
    throw new Error("Wallet not configured for HyperFX execution");
  }

  const placed = await run.next(placementTxHash);
  if (placed.done || placed.value.status !== IntentOrderStatus.ORDER_PLACED) {
    throw new Error("HyperFX order was not placed");
  }

  const placedOrder = (placed.value as { order?: Order }).order;
  const placementReceipt = await publicClient.waitForTransactionReceipt({
    hash: placementTxHash,
  });
  if (placedOrder) {
    saveHyperfxPlacedOrder(
      placementTxHash,
      quote.network,
      quote.chainId,
      placedOrder,
      placementReceipt.blockNumber,
    );
  }

  // Must keep consuming executeBest after placement — it drives the solver auction
  // (autoSelect on BIDS_RECEIVED). Without this, USDC is escrowed but cNGN is never delivered.
  // Known limitation: if the tab closes before fill completes, rely on on-chain status polling.
  void trackHyperfxFillInBackground(run, placementTxHash);

  return { placementTxHash, fillTxHash: placementTxHash };
}
