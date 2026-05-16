import { networks } from "@/app/mocks";

const SENDER_ORDER_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** On-chain gateway order id from `OrderCreated` (bytes32 hex). */
export function isGatewayOrderId(id: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(id.trim());
}

/** Aggregator v2 sender payment order id (UUID). */
export function isSenderPaymentOrderUuid(id: string): boolean {
  return SENDER_ORDER_UUID_RE.test(id.trim());
}

/** Maps Noblocks `transactions.network` (chain display name) → EVM chain id for gateway status. */
export function resolveChainIdFromNetworkName(networkName: string): number | null {
  const trimmed = networkName.trim();
  if (!trimmed) return null;
  const match = networks.find((n) => n.chain.name === trimmed);
  const id = match?.chain?.id;
  return typeof id === "number" ? id : null;
}
