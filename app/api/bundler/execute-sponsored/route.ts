import { NextRequest, NextResponse } from "next/server";
import { getAddress } from "viem";
import { getClients, parseChainId, parseRpcUrl } from "@/app/lib/bundler/chains";
import { executeSponsored } from "@/app/lib/bundler/executeSponsored";

/**
 * POST /api/bundler/execute-sponsored
 * Executes a sponsored transaction (EIP-7702). When eip7702Authorization is provided,
 * submits type 4 delegation first, then execute.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const accountAddress = body?.accountAddress;
    const callData = body?.callData;
    const chainId = parseChainId(body?.chainId);
    const rpcUrl = parseRpcUrl(body?.rpcUrl);
    const eip7702Authorization = body?.eip7702Authorization;
    const delegationContractAddress = body?.delegationContractAddress;

    if (!rpcUrl) {
      return NextResponse.json({ error: "rpcUrl is required" }, { status: 400 });
    }
    if (!accountAddress || typeof accountAddress !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(accountAddress)) {
      return NextResponse.json({ error: "accountAddress (0x + 40 hex) is required" }, { status: 400 });
    }
    if (!callData || typeof callData !== "string" || !callData.startsWith("0x")) {
      return NextResponse.json({ error: "callData (0x-prefixed hex string) is required" }, { status: 400 });
    }
    console.log("delegationContractAddress", delegationContractAddress);

    if (eip7702Authorization) {
      if (!delegationContractAddress || typeof delegationContractAddress !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(delegationContractAddress)) {
        return NextResponse.json(
          { error: "delegationContractAddress (0x + 40 hex) is required when eip7702Authorization is provided" },
          { status: 400 }
        );
      }
      const authContract =
        (eip7702Authorization as Record<string, unknown>).address ??
        (eip7702Authorization as Record<string, unknown>).contractAddress;
      const authContractStr = typeof authContract === "string" ? authContract : "";
      if (authContractStr.toLowerCase() !== getAddress(delegationContractAddress).toLowerCase()) {
        return NextResponse.json(
          { error: "eip7702Authorization must target the delegation contract (delegationContractAddress)" },
          { status: 400 }
        );
      }
    }

    const { publicClient, walletClient, chain } = getClients(chainId, rpcUrl);

    const result = await executeSponsored(publicClient, walletClient, chain, {
      accountAddress: getAddress(accountAddress) as `0x${string}`,
      callData: callData as `0x${string}`,
      eip7702Authorization: eip7702Authorization ?? undefined,
    });

    console.log("result", result);
    return NextResponse.json({
      transactionHash: result.transactionHash,
      ...(result.delegationTransactionHash != null && {
        delegationTransactionHash: result.delegationTransactionHash,
      }),
    });
  } catch (error) {
    console.error("Error executing sponsored tx:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to execute sponsored transaction",
      },
      { status: 500 }
    );
  }
}
