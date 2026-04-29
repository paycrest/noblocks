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
import { STARKNET_READY_ACCOUNT_CLASSHASH } from "@/app/lib/config";
import { cairo, CallData, byteArray, validateAndParseAddress } from "starknet";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiError,
  trackApiRequest,
  trackApiResponse,
} from "@/app/lib/server-analytics";

const ROUTE = "/api/starknet/create-order" as const;

export const POST = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    // Get the wallet address from the header set by the middleware
    const walletAddress = request.headers
      .get("x-wallet-address")
      ?.toLowerCase();

    if (!walletAddress) {
      trackApiError(request, ROUTE, "POST", new Error("Unauthorized"), 401);
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      trackApiError(
        request,
        ROUTE,
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
        ROUTE,
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

    trackApiRequest(request, ROUTE, "POST", {
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
      gatewayAddress,
      amount,
      rate,
      senderFeeRecipient,
      senderFee,
      refundAddress,
      messageHash,
      origin: clientOrigin,
      address: WalletAddress,
    } = body;

    // Validate required fields
    if (!walletId || !publicKey || !tokenAddress || !gatewayAddress) {
      trackApiError(request, ROUTE, "POST", new Error("Missing required fields"), 400, {
        wallet_address: walletAddress,
      });
      return NextResponse.json(
        {
          error: "Missing required fields",
          missing: {
            walletId: !walletId,
            publicKey: !publicKey,
            tokenAddress: !tokenAddress,
            gatewayAddress: !gatewayAddress,
          },
        },
        { status: 400 },
      );
    }

    if (
      amount === undefined ||
      rate === undefined ||
      !senderFeeRecipient ||
      senderFee === undefined ||
      !refundAddress ||
      !messageHash
    ) {
      trackApiError(
        request,
        ROUTE,
        "POST",
        new Error("Missing transaction parameters"),
        400,
        { wallet_address: walletAddress },
      );
      return NextResponse.json(
        {
          error: "Missing transaction parameters",
          missing: {
            amount: amount === undefined,
            rate: rate === undefined,
            senderFeeRecipient: !senderFeeRecipient,
            senderFee: senderFee === undefined,
            refundAddress: !refundAddress,
            messageHash: !messageHash,
          },
        },
        { status: 400 },
      );
    }

    if (!WalletAddress || typeof WalletAddress !== "string") {
      trackApiError(
        request,
        ROUTE,
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
        ROUTE,
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

    // Use class hash from client or built-in Ready Account default
    const classHash = clientClassHash || STARKNET_READY_ACCOUNT_CLASSHASH;

    // Use origin from client or header
    const origin = clientOrigin || request.headers.get("origin") || undefined;

    const { publicKey: walletPublicKey } = await getStarknetWallet(walletId);

    let config;
    try {
      config = await setupPaymaster();
    } catch (e: any) {
      trackApiError(
        request,
        ROUTE,
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

    // Build account with paymaster support
    const { account, address } = await buildReadyAccount({
      walletId,
      publicKey: walletPublicKey,
      classHash,
      userJwt: token,
      userId: authUserId,
      origin,
      paymasterRpc,
    });

    // Convert amounts to u256 (following the working script pattern)
    const amountU256 = cairo.uint256(BigInt(amount));
    const senderFeeU256 = cairo.uint256(BigInt(senderFee));

    // Encode message hash as Cairo ByteArray
    const messageHashByteArray = byteArray.byteArrayFromString(messageHash);

    // Calculate total amount (amount + senderFee)
    const totalAmount = BigInt(amount) + BigInt(senderFee);
    const totalAmountU256 = cairo.uint256(totalAmount);

    // Prepare calls using manual call structure (more reliable than populate)
    const calls = [
      // 1. Approve gateway to spend tokens
      {
        contractAddress: tokenAddress,
        entrypoint: "approve",
        calldata: CallData.compile({
          spender: gatewayAddress,
          amount: totalAmountU256,
        }),
      },
      // 2. Create order
      {
        contractAddress: gatewayAddress,
        entrypoint: "create_order",
        calldata: CallData.compile({
          token: tokenAddress,
          amount: amountU256,
          rate: rate,
          sender_fee_recipient: senderFeeRecipient,
          sender_fee: senderFeeU256,
          refund_address: refundAddress,
          message_hash: messageHashByteArray, // Use encoded ByteArray
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
          ROUTE,
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

    // Execute transaction with paymaster
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
        ROUTE,
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

    let orderId;

    // Wait for transaction confirmation
    const wait = true;
    if (wait) {
      try {
        const txReceipt = await account.waitForTransaction(
          result.transaction_hash,
        );
        if (txReceipt.isSuccess()) {
          const rawEvents = txReceipt.value.events;
          rawEvents.forEach((event: { keys?: unknown; data?: string[] }) => {
            if (
              event.keys &&
              Object.values(event.keys as Record<string, string>).includes(
                "0x3427759bfd3b941f14e687e129519da3c9b0046c5b9aaa290bb1dede63753b3",
              )
            ) {
              orderId = event.data?.[2];
            }
          });
        }
      } catch (error) {
        console.log(
          "[API] Warning: Could not confirm transaction, but it may still succeed",
        );
      }
    }

    const responseTime = Date.now() - startTime;
    trackApiResponse(ROUTE, "POST", 200, responseTime, {
      wallet_address: walletAddress,
      privy_user_id: authUserId,
      sponsored: isSponsored,
    });

    return NextResponse.json({
      success: true,
      walletId,
      address,
      transactionHash: result.transaction_hash,
      mode: isSponsored ? "sponsored" : "default",
      messageHash,
      orderId,
    });
  } catch (error: unknown) {
    console.error("[API] Error in Starknet create-order:", error);
    const responseTime = Date.now() - startTime;
    const err =
      error instanceof Error ? error : new Error("Failed to execute transaction");
    const walletAddressCatch = request.headers
      .get("x-wallet-address")
      ?.toLowerCase();
    trackApiError(request, ROUTE, "POST", err, 500, {
      ...(walletAddressCatch ? { wallet_address: walletAddressCatch } : {}),
      response_time_ms: responseTime,
    });
    return NextResponse.json(
      { error: err.message || "Failed to execute transaction" },
      { status: 500 },
    );
  }
});
