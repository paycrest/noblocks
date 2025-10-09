import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import { cashbackConfig } from "@/app/lib/config";
import { FALLBACK_TOKENS, getRpcUrl } from "@/app/utils";
import { createWalletClient, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { erc20Abi } from "viem";

// POST /api/blockfest/cashback
// Body: { walletAddress: string, amount: string, tokenType: "USDC" | "USDT" }
export const POST = withRateLimit(async (request: NextRequest) => {
  const start = Date.now();
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return NextResponse.json(
        { success: false, error: "Unsupported content type" },
        { status: 415 },
      );
    }

    const body = await request.json().catch(() => null);

    if (
      !body ||
      typeof body.walletAddress !== "string" ||
      typeof body.amount !== "string" ||
      typeof body.tokenType !== "string"
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 },
      );
    }

    const { walletAddress, amount, tokenType } = body;

    // Validate wallet address
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return NextResponse.json(
        { success: false, error: "Invalid wallet address format" },
        { status: 400 },
      );
    }

    // Validate token type
    if (tokenType !== "USDC" && tokenType !== "USDT") {
      return NextResponse.json(
        { success: false, error: "Invalid token type. Must be USDC or USDT" },
        { status: 400 },
      );
    }

    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return NextResponse.json(
        { success: false, error: "Invalid amount. Must be greater than 0" },
        { status: 400 },
      );
    }

    // Check cashback wallet configuration
    if (!cashbackConfig.walletAddress || !cashbackConfig.walletPrivateKey) {
      console.error("Cashback wallet not configured");
      return NextResponse.json(
        { success: false, error: "Cashback service not configured" },
        { status: 500 },
      );
    }

    // Get token contract address from FALLBACK_TOKENS
    const baseTokens = FALLBACK_TOKENS["Base"];
    const token = baseTokens.find((t) => t.symbol === tokenType);

    if (!token) {
      return NextResponse.json(
        { success: false, error: `Token ${tokenType} not found on Base` },
        { status: 400 },
      );
    }

    // Get RPC URL for Base
    const rpcUrl = getRpcUrl("Base");
    if (!rpcUrl) {
      return NextResponse.json(
        { success: false, error: "Base RPC not configured" },
        { status: 500 },
      );
    }

    // Create wallet account from private key
    const account = privateKeyToAccount(
      cashbackConfig.walletPrivateKey as `0x${string}`,
    );

    // Create wallet client
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(rpcUrl),
    });

    // Parse amount with proper decimals (6 for both USDC and USDT on Base)
    const amountInWei = parseUnits(amount, token.decimals);

    // Execute transfer
    const txHash = await walletClient.writeContract({
      address: token.address as `0x${string}`,
      abi: erc20Abi,
      functionName: "transfer",
      args: [walletAddress as `0x${string}`, amountInWei],
    });

    return NextResponse.json({
      success: true,
      txHash,
      amount,
      tokenType,
      response_time_ms: Date.now() - start,
    });
  } catch (err) {
    console.error("BlockFest cashback transfer error:", err);

    // Handle specific viem errors
    let errorMessage = "Failed to transfer cashback";
    if (err instanceof Error) {
      if (err.message.includes("insufficient funds")) {
        errorMessage = "Insufficient funds in cashback wallet";
      } else if (err.message.includes("nonce")) {
        errorMessage = "Transaction nonce error. Please try again";
      } else if (err.message.includes("gas")) {
        errorMessage = "Gas estimation failed. Please try again";
      } else {
        errorMessage = err.message;
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        response_time_ms: Date.now() - start,
      },
      { status: 500 },
    );
  }
});
