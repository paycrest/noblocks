/**
 * Shared HyperFX on-chain order status resolution (client + status API).
 */

import { IntentGatewayABI, orderCommitment, type Order } from "@hyperbridge/sdk";
import type { Hex, PublicClient } from "viem";
import { parseEventLogs } from "viem";

export const HYPERFX_GATEWAY_BY_NETWORK: Record<string, `0x${string}`> = {
  Base: "0xAe041F7B0CB581876832830baeB6a2Aa2a3C9716",
};

const INTENT_GATEWAY_ABI =
  (IntentGatewayABI as { ABI?: typeof IntentGatewayABI }).ABI ??
  IntentGatewayABI;

export type HyperfxTerminalStatus = "SUCCESS" | "REFUNDED" | "FAILED" | "PROCESSING";

export type HyperfxOrderStatus = {
  status: HyperfxTerminalStatus;
  fillTxHash?: Hex;
};

function tokenBytes32ToAddress(token: Hex): `0x${string}` {
  return `0x${token.slice(-40)}` as `0x${string}`;
}

/** Ensures `order.id` matches the on-chain commitment used by fills/refunds. */
export function normalizeHyperfxOrder(order: Order): Order {
  const id = order.id ?? orderCommitment(order);
  return { ...order, id };
}

export async function isOrderFilledByStorage(
  client: PublicClient,
  gateway: `0x${string}`,
  commitment: Hex,
): Promise<boolean> {
  const filledSlot = await client.readContract({
    abi: INTENT_GATEWAY_ABI,
    address: gateway,
    functionName: "calculateCommitmentSlotHash",
    args: [commitment],
  });
  const filledStatus = await client.getStorageAt({
    address: gateway,
    slot: filledSlot,
  });
  return (
    filledStatus !==
    "0x0000000000000000000000000000000000000000000000000000000000000000"
  );
}

/** Scans gateway logs for OrderFilled — fallback when storage slot lags or differs. */
export async function findOrderFilledTxHash(
  client: PublicClient,
  gateway: `0x${string}`,
  commitment: Hex,
  fromBlock: bigint,
): Promise<Hex | null> {
  const logs = await client.getLogs({
    address: gateway,
    fromBlock,
    toBlock: "latest",
  });
  const events = parseEventLogs({
    abi: INTENT_GATEWAY_ABI,
    logs,
    eventName: "OrderFilled",
  });
  const match = events.find(
    (event) =>
      event.args.commitment?.toLowerCase() === commitment.toLowerCase(),
  );
  return match?.transactionHash ?? null;
}

export async function isOrderEscrowEmpty(
  client: PublicClient,
  gateway: `0x${string}`,
  order: Order,
): Promise<boolean> {
  if (!order.inputs?.length) return false;
  const commitment = (order.id ?? orderCommitment(order)) as Hex;
  for (const input of order.inputs) {
    const escrowed = await client.readContract({
      abi: INTENT_GATEWAY_ABI,
      address: gateway,
      functionName: "_orders",
      args: [commitment, tokenBytes32ToAddress(input.token as Hex)],
    });
    if (escrowed !== 0n) return false;
  }
  return true;
}

/**
 * Resolves terminal HyperFX order status from on-chain state.
 *
 * A filled order also clears escrow — never treat "escrow empty" alone as refunded.
 */
export async function resolveHyperfxOrderStatus(
  client: PublicClient,
  gateway: `0x${string}`,
  orderInput: Order,
  placementBlockNumber: bigint,
): Promise<HyperfxOrderStatus> {
  const order = normalizeHyperfxOrder(orderInput);
  const commitment = order.id as Hex;

  if (await isOrderFilledByStorage(client, gateway, commitment)) {
    return { status: "SUCCESS", fillTxHash: undefined };
  }

  const fillTxHash = await findOrderFilledTxHash(
    client,
    gateway,
    commitment,
    placementBlockNumber,
  );
  if (fillTxHash) {
    return { status: "SUCCESS", fillTxHash };
  }

  const escrowEmpty = await isOrderEscrowEmpty(client, gateway, order);
  if (!escrowEmpty) {
    return { status: "PROCESSING" };
  }

  const blockNumber = await client.getBlockNumber();
  if (blockNumber > order.deadline) {
    // Escrow cleared after deadline without a fill → cancelled / refunded.
    return { status: "REFUNDED" };
  }

  // Escrow cleared before deadline but no fill detected yet — still settling.
  return { status: "PROCESSING" };
}
