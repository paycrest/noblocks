/**
 * LayerSwap API client (server-side). Proxied via /api/earn/layerswap/* routes.
 *
 * Status vocabulary and predicates live in ./layerswapStatus so client code can
 * import them without dragging this module — and LAYERSWAP_API_KEY — into the
 * browser bundle. They are re-exported here for server callers.
 */

import "server-only";
import axios from "axios";
import type { Call } from "starknet";
import { getLayerswapApiBase, getLayerswapApiKey } from "./server-config";
import {
  EARN_USDC_SYMBOL,
  LAYERSWAP_STARKNET_NETWORK,
  layerswapSourceNetwork,
} from "./earnChains";
import type { LayerswapSwapStatus } from "./layerswapStatus";

export {
  isLayerswapSuccessStatus,
  isLayerswapTerminalStatus,
} from "./layerswapStatus";
export type { LayerswapSwapStatus };
export { getLayerswapApiKey };

const UPSTREAM_TIMEOUT_MS = 30_000;

export interface LayerswapDepositAction {
  type: string;
  to_address: string;
  amount: number;
  amount_in_base_units: string;
  call_data?: string | null;
  encoded_args?: string[];
  token?: { contract?: string | null; symbol?: string; decimals?: number };
  order?: number;
}

export interface LayerswapQuote {
  receive_amount: number;
  requested_amount: number;
  avg_completion_time?: string;
  total_fee?: number;
  min_receive_amount?: number;
}

export interface LayerswapPreparedSwap {
  quote?: LayerswapQuote;
  swap?: {
    id: string;
    status: LayerswapSwapStatus;
    source_address?: string | null;
    destination_address?: string | null;
    fail_reason?: string | null;
  };
  deposit_actions?: LayerswapDepositAction[];
}

export interface LayerswapApiResponse<T> {
  data?: T;
  error?: { code?: string; message?: string };
}

function layerswapHeaders(apiKey: string): Record<string, string> {
  return {
    "X-LS-APIKEY": apiKey,
    "Content-Type": "application/json",
  };
}

export async function layerswapGetQuote(params: {
  apiKey: string;
  sourceNetwork: string;
  amount: number;
  destinationAddress: string;
  destinationNetwork?: string;
}): Promise<LayerswapQuote> {
  const { data } = await axios.get<LayerswapApiResponse<LayerswapQuote>>(
    `${getLayerswapApiBase()}/api/v2/quote`,
    {
      headers: layerswapHeaders(params.apiKey),
      params: {
        source_network: params.sourceNetwork,
        source_token: EARN_USDC_SYMBOL,
        destination_network:
          params.destinationNetwork ?? LAYERSWAP_STARKNET_NETWORK,
        destination_token: EARN_USDC_SYMBOL,
        destination_address: params.destinationAddress,
        amount: params.amount,
      },
      timeout: UPSTREAM_TIMEOUT_MS,
      validateStatus: () => true,
    },
  );
  if (data.error?.message) {
    throw new Error(data.error.message);
  }
  if (!data.data) {
    throw new Error("LayerSwap quote unavailable");
  }
  return data.data;
}

export async function layerswapCreateEarnSwap(params: {
  apiKey: string;
  sourceChainName: string;
  amount: number;
  destinationAddress: string;
  sourceAddress?: string;
  refundAddress?: string;
}): Promise<LayerswapPreparedSwap> {
  const sourceNetwork = layerswapSourceNetwork(params.sourceChainName);
  if (!sourceNetwork) {
    throw new Error(`Unsupported earn source chain: ${params.sourceChainName}`);
  }

  const { data } = await axios.post<LayerswapApiResponse<LayerswapPreparedSwap>>(
    `${getLayerswapApiBase()}/api/v2/swaps`,
    {
      source_network: sourceNetwork,
      source_token: EARN_USDC_SYMBOL,
      destination_network: LAYERSWAP_STARKNET_NETWORK,
      destination_token: EARN_USDC_SYMBOL,
      destination_address: params.destinationAddress,
      amount: params.amount,
      source_address: params.sourceAddress ?? null,
      refund_address: params.refundAddress ?? params.sourceAddress ?? null,
      use_depository: true,
      use_deposit_address: false,
      refuel: false,
    },
    {
      headers: layerswapHeaders(params.apiKey),
      timeout: UPSTREAM_TIMEOUT_MS,
      validateStatus: () => true,
    },
  );

  if (data.error?.message) {
    throw new Error(data.error.message);
  }
  if (!data.data?.swap?.id) {
    throw new Error("LayerSwap swap creation failed");
  }
  return data.data;
}

/** Starknet → EVM earn withdraw (reverse of deposit). */
export async function layerswapCreateEarnWithdrawSwap(params: {
  apiKey: string;
  destinationChainName: string;
  amount: number;
  /** EVM address receiving bridged USDC. */
  destinationAddress: string;
  /** Starknet address sending USDC. */
  sourceAddress: string;
  refundAddress?: string;
}): Promise<LayerswapPreparedSwap> {
  const destinationNetwork = layerswapSourceNetwork(params.destinationChainName);
  if (!destinationNetwork) {
    throw new Error(
      `Unsupported earn destination chain: ${params.destinationChainName}`,
    );
  }

  const { data } = await axios.post<LayerswapApiResponse<LayerswapPreparedSwap>>(
    `${getLayerswapApiBase()}/api/v2/swaps`,
    {
      source_network: LAYERSWAP_STARKNET_NETWORK,
      source_token: EARN_USDC_SYMBOL,
      destination_network: destinationNetwork,
      destination_token: EARN_USDC_SYMBOL,
      destination_address: params.destinationAddress,
      amount: params.amount,
      source_address: params.sourceAddress,
      refund_address: params.refundAddress ?? params.sourceAddress,
      use_depository: true,
      use_deposit_address: false,
      refuel: false,
    },
    {
      headers: layerswapHeaders(params.apiKey),
      timeout: UPSTREAM_TIMEOUT_MS,
      validateStatus: () => true,
    },
  );

  if (data.error?.message) {
    throw new Error(data.error.message);
  }
  if (!data.data?.swap?.id) {
    throw new Error("LayerSwap withdraw swap creation failed");
  }
  return data.data;
}

export async function layerswapGetSwap(params: {
  apiKey: string;
  swapId: string;
}): Promise<LayerswapPreparedSwap & { swap: NonNullable<LayerswapPreparedSwap["swap"]> }> {
  const { data } = await axios.get<
    LayerswapApiResponse<LayerswapPreparedSwap>
  >(`${getLayerswapApiBase()}/api/v2/swaps/${encodeURIComponent(params.swapId)}`, {
    headers: layerswapHeaders(params.apiKey),
    timeout: UPSTREAM_TIMEOUT_MS,
    validateStatus: () => true,
  });
  if (data.error?.message) {
    throw new Error(data.error.message);
  }
  if (!data.data?.swap) {
    throw new Error("LayerSwap swap not found");
  }
  return data.data as LayerswapPreparedSwap & {
    swap: NonNullable<LayerswapPreparedSwap["swap"]>;
  };
}

interface ParsedLayerswapCall {
  contractAddress: string;
  entrypoint: string;
  calldata?: string[];
}

/** LayerSwap Starknet deposit_actions embed JSON calls in `call_data`. */
export function layerswapDepositActionsToStarknetCalls(
  depositActions: LayerswapDepositAction[],
): Call[] {
  const sorted = [...depositActions].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );

  const calls: Call[] = [];
  for (const action of sorted) {
    const raw = action.call_data?.trim();
    if (!raw || raw === "0x") continue;

    let parsed: ParsedLayerswapCall[];
    try {
      parsed = JSON.parse(raw) as ParsedLayerswapCall[];
    } catch {
      throw new Error("Invalid LayerSwap Starknet call_data");
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("LayerSwap Starknet deposit action has no calls");
    }

    for (const c of parsed) {
      if (!c.contractAddress || !c.entrypoint) {
        throw new Error("LayerSwap Starknet call is missing fields");
      }
      calls.push({
        contractAddress: c.contractAddress,
        entrypoint: c.entrypoint,
        calldata: c.calldata ?? [],
      });
    }
  }

  if (calls.length === 0) {
    throw new Error("No LayerSwap Starknet deposit action to execute");
  }
  return calls;
}
