import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseEventLogs } from "viem";
import { withRateLimit } from "@/app/lib/rate-limit";
import { getRpcUrl } from "@/app/utils";
import type { BridgeStatusResult } from "@/app/lib/bridge";
import {
  HYPERFX_GATEWAY_BY_NETWORK,
  orderFromOrderPlacedLog,
  resolveHyperfxOrderStatus,
} from "@/app/lib/hyperfxStatus";
import { HYPERFX_VIEM_CHAIN_BY_NETWORK } from "@/app/lib/hyperfxNetworks";
import { IntentGatewayABI } from "@hyperbridge/sdk";

const CHAIN_BY_NETWORK = HYPERFX_VIEM_CHAIN_BY_NETWORK;

const ABI =
  (IntentGatewayABI as { ABI?: typeof IntentGatewayABI }).ABI ??
  IntentGatewayABI;

export const GET = withRateLimit(async (request: NextRequest) => {
  const txHash = request.nextUrl.searchParams.get("txHash")?.trim();
  const network = request.nextUrl.searchParams.get("network")?.trim() || "Base";

  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return NextResponse.json({ error: "Valid txHash is required" }, { status: 400 });
  }

  const gateway = HYPERFX_GATEWAY_BY_NETWORK[network];
  const chain = CHAIN_BY_NETWORK[network];
  const rpcUrl = getRpcUrl(network);
  if (!gateway || !chain || !rpcUrl) {
    return NextResponse.json({ error: `Unsupported network: ${network}` }, { status: 422 });
  }

  const client = createPublicClient({ chain, transport: http(rpcUrl) });
  const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });

  const placed = parseEventLogs({
    abi: ABI,
    logs: receipt.logs.filter((log) => log.address.toLowerCase() === gateway.toLowerCase()),
  }).find((event) => event.eventName === "OrderPlaced");

  if (!placed) {
    const result: BridgeStatusResult = { status: "PROCESSING", txHash };
    return NextResponse.json(result);
  }

  const order = orderFromOrderPlacedLog(placed.args);

  const resolved = await resolveHyperfxOrderStatus(
    client,
    gateway,
    order,
    receipt.blockNumber,
  );

  if (resolved.status === "SUCCESS") {
    const result: BridgeStatusResult = {
      status: "SUCCESS",
      txHash,
      destinationTxHash: resolved.fillTxHash ?? txHash,
    };
    return NextResponse.json(result);
  }

  if (resolved.status === "REFUNDED") {
    const result: BridgeStatusResult = { status: "REFUNDED", txHash };
    return NextResponse.json(result);
  }

  if (resolved.status === "FAILED") {
    const result: BridgeStatusResult = { status: "FAILED", txHash };
    return NextResponse.json(result);
  }

  const result: BridgeStatusResult = { status: "PROCESSING", txHash };
  return NextResponse.json(result);
});
