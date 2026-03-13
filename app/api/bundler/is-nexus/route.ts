import { NextRequest, NextResponse } from "next/server";
import { getClients, parseChainId, parseRpcUrl } from "@/app/lib/bundler/chains";
import { getNexusStatus } from "@/app/lib/bundler/userOp";

/**
 * GET /api/bundler/is-nexus?smartAccountAddress=0x...&chainId=56&rpcUrl=...
 * Alias for nexus/status for compatibility with upgrade-server path.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const smartAccountAddress = searchParams.get("smartAccountAddress");
    const chainIdRaw = searchParams.get("chainId");

    if (!smartAccountAddress || !/^0x[0-9a-fA-F]{40}$/.test(smartAccountAddress)) {
      return NextResponse.json(
        { error: "Query param smartAccountAddress (0x + 40 hex) is required" },
        { status: 400 }
      );
    }

    const chainId = parseChainId(chainIdRaw);
    const rpcUrl = parseRpcUrl(chainId);
    const { publicClient } = getClients(chainId, rpcUrl, false);
    const status = await getNexusStatus(publicClient, smartAccountAddress as `0x${string}`);

    return NextResponse.json({
      smartAccountAddress,
      chainId,
      rpcUrl,
      ...status,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to check nexus status",
      },
      { status: 400 }
    );
  }
}
