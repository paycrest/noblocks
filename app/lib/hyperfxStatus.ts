/**
 * Shared HyperFX on-chain order status resolution (client + status API).
 */

import { IntentGatewayABI, orderCommitment, type Order } from "@hyperbridge/sdk";
import type { Hex, PublicClient } from "viem";
import { parseEventLogs } from "viem";
import { HYPERFX_GATEWAY_BY_NETWORK } from "@/app/lib/hyperfxNetworks";

export { HYPERFX_GATEWAY_BY_NETWORK };

const INTENT_GATEWAY_ABI =
  (IntentGatewayABI as { ABI?: typeof IntentGatewayABI }).ABI ??
  IntentGatewayABI;

const ORDER_FILLED_EVENT = INTENT_GATEWAY_ABI.find(
  (item): item is Extract<(typeof INTENT_GATEWAY_ABI)[number], { type: "event"; name: "OrderFilled" }> =>
    item.type === "event" && item.name === "OrderFilled",
);

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

type OrderPlacedEventArgs = {
  user: `0x${string}`;
  source: string;
  destination: string;
  deadline: bigint;
  nonce: bigint;
  fees: bigint;
  session: `0x${string}`;
  beneficiary: `0x${string}`;
  predispatch: ReadonlyArray<{ token: `0x${string}`; amount: bigint }>;
  inputs: ReadonlyArray<{ token: `0x${string}`; amount: bigint }>;
  outputs: ReadonlyArray<{ token: `0x${string}`; amount: bigint }>;
  predispatchCall?: `0x${string}`;
  outputCall?: `0x${string}`;
};

/** Builds a mutable SDK `Order` from an `OrderPlaced` log (viem args are readonly). */
export function orderFromOrderPlacedLog(args: OrderPlacedEventArgs): Order {
  const order: Order = {
    user: args.user,
    source: args.source,
    destination: args.destination,
    deadline: args.deadline,
    nonce: args.nonce,
    fees: args.fees,
    session: args.session,
    predispatch: {
      assets: args.predispatch.map((asset) => ({ ...asset })),
      call: args.predispatchCall ?? "0x",
    },
    inputs: args.inputs.map((asset) => ({ ...asset })),
    output: {
      beneficiary: args.beneficiary,
      assets: args.outputs.map((asset) => ({ ...asset })),
      call: args.outputCall ?? "0x",
    },
  };
  return normalizeHyperfxOrder(order);
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
  if (!ORDER_FILLED_EVENT) {
    return null;
  }

  const logs = await client.getLogs({
    address: gateway,
    event: ORDER_FILLED_EVENT,
    args: { commitment },
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
    if (escrowed !== BigInt(0)) return false;
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
    const fillTxHash = await findOrderFilledTxHash(
      client,
      gateway,
      commitment,
      placementBlockNumber,
    );
    return fillTxHash
      ? { status: "SUCCESS", fillTxHash }
      : { status: "SUCCESS" };
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
