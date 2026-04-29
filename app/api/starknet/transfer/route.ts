import { NextRequest, NextResponse } from "next/server";
import { verifyJWT } from "@/app/lib/jwt";
import { DEFAULT_PRIVY_CONFIG } from "@/app/lib/config";
import {
  buildReadyAccount,
  deployReadyAccount,
  getRpcProvider,
  getStarknetWallet,
  setupPaymaster,
} from "@/app/lib/starknet";
import { cairo, CallData, validateAndParseAddress } from "starknet";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiError,
  trackApiRequest,
  trackApiResponse,
} from "@/app/lib/server-analytics";

export const POST = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    // Get the wallet address from the header set by the middleware
    const walletAddress = request.headers
      .get("x-wallet-address")
      ?.toLowerCase();

    if (!walletAddress) {
      trackApiError(request, "/api/starknet/transfer", "POST", new Error("Unauthorized"), 401);
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      trackApiError(
        request,
        "/api/starknet/transfer",
        "POST",
        new Error("Missing or invalid authorization header"),
        401,
        { wallet_address: walletAddress },
      );
      return NextResponse.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 },
      );
    }

    const token = authHeader.substring(7);
    const { payload } = await verifyJWT(token, DEFAULT_PRIVY_CONFIG);
    const authUserId = payload.sub || payload.userId;

    if (!authUserId) {
      trackApiError(
        request,
        "/api/starknet/transfer",
        "POST",
        new Error("Invalid token: missing user ID"),
        401,
        { wallet_address: walletAddress },
      );
      return NextResponse.json(
        { error: "Invalid token: missing user ID" },
        { status: 401 },
      );
    }

    trackApiRequest(request, "/api/starknet/transfer", "POST", {
      wallet_address: walletAddress,
      privy_user_id: authUserId,
    });

    // Get request body
    const body = await request.json();
    const {
      walletId,
      publicKey,
      classHash: clientClassHash,
      tokenAddress,
      amount,
      recipientAddress,
      origin: clientOrigin,
      address: WalletAddress,
    } = body;

    // Validate required fields
    if (!walletId || !publicKey || !tokenAddress || !recipientAddress) {
      trackApiError(request, "/api/starknet/transfer", "POST", new Error("Missing required fields"), 400, {
        wallet_address: walletAddress,
      });
      return NextResponse.json(
        {
          error: "Missing required fields",
          missing: {
            walletId: !walletId,
            publicKey: !publicKey,
            tokenAddress: !tokenAddress,
            recipientAddress: !recipientAddress,
          },
        },
        { status: 400 },
      );
    }

    if (amount === undefined || amount === null) {
      trackApiError(request, "/api/starknet/transfer", "POST", new Error("Missing amount parameter"), 400, {
        wallet_address: walletAddress,
      });
      return NextResponse.json(
        { error: "Missing amount parameter" },
        { status: 400 },
      );
    }

    if (!WalletAddress || typeof WalletAddress !== "string") {
      trackApiError(
        request,
        "/api/starknet/transfer",
        "POST",
        new Error("Missing or invalid wallet address"),
        400,
        { wallet_address: walletAddress },
      );
      return NextResponse.json(
        {
          error: "Missing or invalid wallet address",
          missing: {
            address: !WalletAddress || typeof WalletAddress !== "string",
          },
        },
        { status: 400 },
      );
    }

    let normalizedWalletAddress: string;
    try {
      normalizedWalletAddress = validateAndParseAddress(WalletAddress);
    } catch {
      trackApiError(
        request,
        "/api/starknet/transfer",
        "POST",
        new Error("Invalid wallet address format"),
        400,
        { wallet_address: walletAddress },
      );
      return NextResponse.json(
        { error: "Invalid wallet address format" },
        { status: 400 },
      );
    }

    let isDeployed = false;
    const provider = getRpcProvider();
    try {
      await provider.getClassHashAt(normalizedWalletAddress);
      isDeployed = true;
    } catch {
      isDeployed = false;
    }

    // Use class hash from client or fallback to server env
    const classHash = clientClassHash || process.env.STARKNET_READY_CLASSHASH;
    if (!classHash) {
      trackApiError(
        request,
        "/api/starknet/transfer",
        "POST",
        new Error("STARKNET_READY_CLASSHASH not configured"),
        500,
        { wallet_address: walletAddress },
      );
      return NextResponse.json(
        { error: "STARKNET_READY_CLASSHASH not configured" },
        { status: 500 },
      );
    }

    // Use origin from client or header
    const origin = clientOrigin || request.headers.get("origin") || undefined;

    // Get wallet public key from Privy
    const { publicKey: walletPublicKey } = await getStarknetWallet(walletId);
    // Setup paymaster if configured
    const usePaymaster = !!(
      process.env.STARKNET_PAYMASTER_URL && process.env.STARKNET_PAYMASTER_MODE
    );

    if (!usePaymaster) {
      trackApiError(request, "/api/starknet/transfer", "POST", new Error("Paymaster not configured"), 500, {
        wallet_address: walletAddress,
      });
      return NextResponse.json(
        { error: "Paymaster not configured" },
        { status: 500 },
      );
    }

    let config;
    try {
      config = await setupPaymaster();
    } catch (e: any) {
      trackApiError(
        request,
        "/api/starknet/transfer",
        "POST",
        new Error(e?.message || "Failed to initialize paymaster"),
        500,
        { wallet_address: walletAddress },
      );
      return NextResponse.json(
        { error: e?.message || "Failed to initialize paymaster" },
        { status: 500 },
      );
    }
    const { paymasterRpc, isSponsored, gasToken } = config;

    const { account, address } = await buildReadyAccount({
      walletId,
      publicKey: walletPublicKey,
      classHash,
      userJwt: token,
      userId: authUserId,
      origin,
      paymasterRpc,
    });

    // Convert amount to u256 format
    const amountU256 = cairo.uint256(BigInt(amount));

    // Prepare transfer call
    const calls = [
      {
        contractAddress: tokenAddress,
        entrypoint: "transfer",
        calldata: CallData.compile({
          recipient: recipientAddress,
          amount: amountU256,
        }),
      },
    ];

    // Prepare paymaster details
    const paymasterDetails: any = isSponsored
      ? { feeMode: { mode: "sponsored" as const } }
      : { feeMode: { mode: "default" as const, gasToken } };

    // Estimate fees if not sponsored
    let maxFee: any = undefined;
    if (!isSponsored) {
      try {
        const est = await account.estimatePaymasterTransactionFee(
          calls,
          paymasterDetails,
        );
        const withMargin15 = (v: any) => {
          const bi = BigInt(v.toString());
          return (bi * BigInt(3) + BigInt(1)) / BigInt(2); // ceil(1.5x)
        };
        maxFee = withMargin15(est.suggested_max_fee_in_gas_token);
      } catch (error: any) {
        console.error("[API] Fee estimation failed:", error.message);
        trackApiError(
          request,
          "/api/starknet/transfer",
          "POST",
          new Error(error?.message || "Fee estimation failed"),
          500,
          { wallet_address: walletAddress },
        );
        return NextResponse.json(
          { error: `Fee estimation failed: ${error.message}` },
          { status: 500 },
        );
      }
    }

    // Execute transfer transaction
    let result;
    try {
      if (!isDeployed) {
        result = await deployReadyAccount({
          walletId,
          publicKey: walletPublicKey,
          classHash,
          userJwt: token,
          userId: authUserId,
          origin,
          calls,
        });
      } else {
        result = await account.executePaymasterTransaction(
          calls,
          paymasterDetails,
          maxFee,
        );
      }
    } catch (error: any) {
      console.error("[API] Error executing transaction:", error);
      trackApiError(
        request,
        "/api/starknet/transfer",
        "POST",
        new Error(error?.message || "Failed to execute transaction"),
        500,
        { wallet_address: walletAddress },
      );
      return NextResponse.json(
        { error: error.message || "Failed to execute transaction" },
        { status: 500 },
      );
    }

    // Wait for transaction confirmation
    try {
      const txReceipt = await account.waitForTransaction(
        result.transaction_hash,
      );

      if (!txReceipt.isSuccess()) {
        trackApiError(
          request,
          "/api/starknet/transfer",
          "POST",
          new Error("Transaction reverted on-chain"),
          500,
          { wallet_address: walletAddress },
        );
        return NextResponse.json(
          { error: "Transaction reverted on-chain" },
          { status: 500 },
        );
      }
    } catch (error) {
      console.log(
        "[API] Warning: Could not confirm transaction, but it may still succeed",
      );
    }

    const responseTime = Date.now() - startTime;
    trackApiResponse("/api/starknet/transfer", "POST", 200, responseTime, {
      wallet_address: walletAddress,
      privy_user_id: authUserId,
    });

    return NextResponse.json({
      success: true,
      transactionHash: result.transaction_hash,
      walletId,
      address,
      amount: amount.toString(),
      recipient: recipientAddress,
    });
  } catch (error: unknown) {
    console.error("[API] Error in Starknet transfer:", error);
    const responseTime = Date.now() - startTime;
    const err =
      error instanceof Error ? error : new Error("Failed to process transfer");
    const walletAddressCatch = request.headers
      .get("x-wallet-address")
      ?.toLowerCase();
    trackApiError(request, "/api/starknet/transfer", "POST", err, 500, {
      ...(walletAddressCatch ? { wallet_address: walletAddressCatch } : {}),
      response_time_ms: responseTime,
    });
    return NextResponse.json(
      { error: err.message || "Failed to process transfer" },
      { status: 500 },
    );
  }
});
