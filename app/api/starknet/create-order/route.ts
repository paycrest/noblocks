import { NextRequest, NextResponse } from "next/server";
import { verifyJWT } from "@/app/lib/jwt";
import { DEFAULT_PRIVY_CONFIG } from "@/app/lib/config";
import { buildReadyAccount, getStarknetWallet, setupPaymaster } from "@/app/lib/starknet";
import { cairo, CallData, byteArray } from "starknet";


export async function POST(request: NextRequest) {
  try {
    // Extract and verify JWT token
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const { payload } = await verifyJWT(token, DEFAULT_PRIVY_CONFIG);
    const authUserId = payload.sub || payload.userId;

    if (!authUserId) {
      return NextResponse.json(
        { error: "Invalid token: missing user ID" },
        { status: 401 }
      );
    }

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
    } = body;

    // Validate required fields
    if (!walletId || !publicKey || !tokenAddress || !gatewayAddress) {
      console.log("[API] Missing required fields:", { walletId, publicKey, tokenAddress, gatewayAddress });
      return NextResponse.json(
        { error: "Missing required fields", missing: { walletId: !walletId, publicKey: !publicKey, tokenAddress: !tokenAddress, gatewayAddress: !gatewayAddress } },
        { status: 400 }
      );
    }

    if (amount === undefined || rate === undefined || !senderFeeRecipient || senderFee === undefined || !refundAddress || !messageHash) {
      console.log("[API] Missing transaction parameters:", { amount, rate, senderFeeRecipient, senderFee, refundAddress, messageHash });
      return NextResponse.json(
        { error: "Missing transaction parameters", missing: { amount: amount === undefined, rate: rate === undefined, senderFeeRecipient: !senderFeeRecipient, senderFee: senderFee === undefined, refundAddress: !refundAddress, messageHash: !messageHash } },
        { status: 400 }
      );
    }

    // Use class hash from client or fallback to server env
    const classHash = clientClassHash || process.env.STARKNET_READY_CLASSHASH;
    if (!classHash) {
      return NextResponse.json(
        { error: "STARKNET_READY_CLASSHASH not configured" },
        { status: 500 }
      );
    }

    // Use origin from client or header
    const origin = clientOrigin || request.headers.get("origin") || undefined;

    const { publicKey: walletPublicKey } = await getStarknetWallet(walletId);

    // Setup paymaster if configured
    const usePaymaster = !!(
      process.env.STARKNET_PAYMASTER_URL && process.env.STARKNET_PAYMASTER_MODE
    );
    
    if (!usePaymaster) {
      return NextResponse.json(
        { error: "Paymaster not configured" },
        { status: 500 }
      );
    }

    let config;
    try {
      config = await setupPaymaster();
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message || "Failed to initialize paymaster" },
        { status: 500 }
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
      paymasterRpc
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
          amount: totalAmountU256
        })
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
          message_hash: messageHashByteArray  // Use encoded ByteArray
        })
      }
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
          paymasterDetails
        );
        const withMargin15 = (v: any) => {
          const bi = BigInt(v.toString());
          return (bi * BigInt(3) + BigInt(1)) / BigInt(2); // ceil(1.5x)
        };
        maxFee = withMargin15(est.suggested_max_fee_in_gas_token);
      } catch (error: any) {
        console.error("[API] Fee estimation failed:", error.message);
        return NextResponse.json(
          { error: `Fee estimation failed: ${error.message}` },
          { status: 500 }
        );
      }
    }

    // Execute transaction with paymaster
    let result;
    try {
      result = await account.executePaymasterTransaction(
        calls,
        paymasterDetails,
        maxFee
      );
    } catch (error: any) {
      console.error("[API] Error executing transaction:", error);
      return NextResponse.json(
        { error: error.message || "Failed to execute transaction" },
        { status: 500 }
      );
    }

    let orderId;

    // Wait for transaction confirmation
    const wait = true;
    if (wait) {
      try {
        const txReceipt = await account.waitForTransaction(result.transaction_hash);
        if (txReceipt.isSuccess()) {
          const rawEvents = txReceipt.value.events;
          rawEvents.forEach((event) => {
            if (Object.values(event.keys).includes("0x3427759bfd3b941f14e687e129519da3c9b0046c5b9aaa290bb1dede63753b3")) {
              orderId = event.data[2];
            }
          });
        }
      } catch (error) {
        console.log("[API] Warning: Could not confirm transaction, but it may still succeed");
      }
    }

    return NextResponse.json({
      success: true,
      walletId,
      address,
      transactionHash: result.transaction_hash,
      mode: isSponsored ? "sponsored" : "default",
      messageHash,
      orderId
    });
  } catch (error: any) {
    console.error("[API] Error executing transaction:", error);
    return NextResponse.json(
      { error: error.message || "Failed to execute transaction" },
      { status: 500 }
    );
  }
}
