import { NextRequest, NextResponse } from "next/server";
import { getClients, parseChainId, parseRpcUrl } from "@/app/lib/bundler/chains";
import {
  generateUserOp,
  PaymasterSponsorshipError,
} from "@/app/lib/bundler/userOp";

const PAYMASTER_URL =
  process.env.PAYMASTER_URL || process.env.BICONOMY_PAYMASTER_URL;
const PAYMASTER_API_KEY =
  process.env.PAYMASTER_API_KEY || process.env.BICONOMY_PAYMASTER_API_KEY;

/**
 * POST /api/bundler/generate-userop
 * Generates an unsigned UserOperation for upgrading a smart account.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { smartAccountAddress, ownerAddress } = body;
    const chainId = parseChainId(body?.chainId);
    const rpcUrl = parseRpcUrl(body?.rpcUrl);

    if (!rpcUrl) {
      return NextResponse.json({ error: "rpcUrl is required" }, { status: 400 });
    }
    if (!smartAccountAddress || !ownerAddress) {
      return NextResponse.json(
        { error: "smartAccountAddress and ownerAddress are required" },
        { status: 400 }
      );
    }
    if (!smartAccountAddress.startsWith("0x") || smartAccountAddress.length !== 42) {
      return NextResponse.json({ error: "Invalid smartAccountAddress format" }, { status: 400 });
    }
    if (!ownerAddress.startsWith("0x") || ownerAddress.length !== 42) {
      return NextResponse.json({ error: "Invalid ownerAddress format" }, { status: 400 });
    }

    const { publicClient } = getClients(chainId, rpcUrl);

    const initCode = body.initCode as `0x${string}` | undefined;
    const hasValidInitCode =
      typeof initCode === "string" &&
      initCode.startsWith("0x") &&
      initCode.length >= 44;

    const skipPaymaster = request.headers.get("x-skip-paymaster") === "true";
    const result = await generateUserOp(
      publicClient,
      smartAccountAddress as `0x${string}`,
      ownerAddress as `0x${string}`,
      {
        ...(!skipPaymaster && PAYMASTER_URL
          ? { paymasterUrl: PAYMASTER_URL, paymasterApiKey: PAYMASTER_API_KEY }
          : {}),
        ...(hasValidInitCode ? { initCode } : {}),
      }
    );

    return NextResponse.json({
      ...result,
      chainId,
      rpcUrl: rpcUrl ?? null,
    });
  } catch (error) {
    if (error instanceof PaymasterSponsorshipError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("Error generating userOp:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to generate userOp",
      },
      { status: 500 }
    );
  }
}
