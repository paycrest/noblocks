import { NextRequest, NextResponse } from "next/server";
import { getAddress } from "viem";
import { getClients, parseChainId, parseRpcUrl } from "@/app/lib/bundler/chains";
import { generateTransferUserOp, type TransferCall } from "@/app/lib/bundler/userOp";

/**
 * POST /api/bundler/generate-transfer-userop
 * Generates an unsigned UserOperation for executing calls from the Nexus account (e.g. ERC20 transfers).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const smartAccountAddress = body?.smartAccountAddress;
    const chainId = parseChainId(body?.chainId);
    const rpcUrl = parseRpcUrl(body?.rpcUrl);
    const rawCalls = body?.calls;

    if (!rpcUrl) {
      return NextResponse.json({ error: "rpcUrl is required" }, { status: 400 });
    }
    if (!smartAccountAddress || !/^0x[0-9a-fA-F]{40}$/.test(smartAccountAddress)) {
      return NextResponse.json(
        { error: "smartAccountAddress (0x + 40 hex) is required" },
        { status: 400 }
      );
    }
    if (!Array.isArray(rawCalls) || rawCalls.length === 0) {
      return NextResponse.json(
        { error: "calls array with at least one { to, data, value? } is required" },
        { status: 400 }
      );
    }

    const calls: TransferCall[] = rawCalls.map((c: unknown, i: number) => {
      const o = c as Record<string, unknown>;
      const to = o?.to;
      const data = o?.data;
      if (typeof to !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(to)) {
        throw new Error(`calls[${i}].to must be a 20-byte hex address`);
      }
      if (typeof data !== "string" || !data.startsWith("0x")) {
        throw new Error(`calls[${i}].data must be a hex string (0x...)`);
      }
      return {
        to: getAddress(to) as `0x${string}`,
        value: o?.value !== undefined ? BigInt(String(o.value)) : BigInt(0),
        data: data as `0x${string}`,
      };
    });

    const { publicClient } = getClients(chainId, rpcUrl);
    const result = await generateTransferUserOp(
      publicClient,
      smartAccountAddress as `0x${string}`,
      calls
    );

    return NextResponse.json({ ...result, chainId, rpcUrl });
  } catch (error) {
    console.error("Error generating transfer userOp:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate transfer userOp",
      },
      { status: 500 }
    );
  }
}
