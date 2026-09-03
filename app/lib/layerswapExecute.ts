"use client";

import {
  encodeFunctionData,
  erc20Abi,
  type Address,
  type Chain,
  type Hex,
} from "viem";
import { needsGatewayApproval } from "@/app/lib/erc20Allowance";
import type { LayerswapDepositAction } from "@/app/lib/layerswap";
import type { BatchCall } from "@/app/lib/providerBatch";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export interface BuildLayerswapDepositCallsParams {
  chain: Chain;
  rpcUrl: string;
  fromAddress: string;
  /** USDC amount being deposited (6 decimals), used when LayerSwap omits it on the action. */
  tokenAmountBaseUnits: bigint;
  depositActions: LayerswapDepositAction[];
}

function parseActionTokenAmount(
  action: LayerswapDepositAction,
  fallback: bigint,
): bigint {
  const encoded = action.encoded_args;
  if (encoded?.length) {
    try {
      const last = BigInt(encoded[encoded.length - 1]!);
      if (last > BigInt(0)) return last;
    } catch {
      // fall through
    }
  }
  try {
    const fromAction = BigInt(action.amount_in_base_units || "0");
    if (fromAction > BigInt(0)) return fromAction;
  } catch {
    // fall through
  }
  return fallback;
}

/**
 * Builds approve + depository calls for LayerSwap earn deposits.
 * Execution must go through the sponsored EIP-7702 bundler (executeBatchCalls) —
 * raw eth_sendTransaction through Privy corrupts ERC-20 approve via dataSuffix.
 */
export async function buildLayerswapDepositBatchCalls(
  params: BuildLayerswapDepositCallsParams,
): Promise<BatchCall[]> {
  const {
    chain,
    rpcUrl,
    fromAddress,
    tokenAmountBaseUnits,
    depositActions,
  } = params;

  if (!rpcUrl) {
    throw new Error(`RPC URL not configured for ${chain.name}`);
  }

  const sorted = [...depositActions].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );

  const calls: BatchCall[] = [];

  for (const action of sorted) {
    const tokenContract = action.token?.contract?.trim();
    const hasCallData = Boolean(action.call_data && action.call_data !== "0x");

    if (
      hasCallData &&
      tokenContract &&
      tokenContract.toLowerCase() !== ZERO_ADDRESS
    ) {
      const approvalAmount = parseActionTokenAmount(action, tokenAmountBaseUnits);
      if (approvalAmount <= BigInt(0)) {
        throw new Error("LayerSwap deposit amount is invalid");
      }

      const mustApprove = await needsGatewayApproval({
        chain,
        rpcUrl,
        token: tokenContract,
        owner: fromAddress,
        spender: action.to_address,
        required: approvalAmount,
      });

      if (mustApprove) {
        calls.push({
          to: tokenContract as Address,
          value: BigInt(0),
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [action.to_address as `0x${string}`, approvalAmount],
          }),
        });
      }
    }

    if (!hasCallData) continue;

    const isNativeAction =
      !tokenContract || tokenContract.toLowerCase() === ZERO_ADDRESS;
    let nativeValue = BigInt(0);
    if (isNativeAction) {
      try {
        nativeValue = BigInt(action.amount_in_base_units || "0");
      } catch {
        throw new Error("LayerSwap deposit amount is invalid");
      }
    }
    calls.push({
      to: action.to_address as Address,
      value: nativeValue,
      data: action.call_data as Hex,
    });
  }

  if (calls.length === 0) {
    throw new Error("No LayerSwap deposit action to execute");
  }

  return calls;
}
