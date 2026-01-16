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
import { cairo, CallData } from "starknet";

export async function POST(request: NextRequest) {
  let isDeployed = false;
  try {
    // Extract and verify JWT token
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 },
      );
    }

    const token = authHeader.substring(7);
    const { payload } = await verifyJWT(token, DEFAULT_PRIVY_CONFIG);
    const authUserId = payload.sub || payload.userId;

    if (!authUserId) {
      return NextResponse.json(
        { error: "Invalid token: missing user ID" },
        { status: 401 },
      );
    }

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

    const provider = getRpcProvider();
    try {
      await provider.getClassHashAt(WalletAddress);
      isDeployed = true;
    } catch {
      isDeployed = false;
    }

    // Validate required fields
    if (!walletId || !publicKey || !tokenAddress || !recipientAddress) {
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
      return NextResponse.json(
        { error: "Missing amount parameter" },
        { status: 400 },
      );
    }

    // Use class hash from client or fallback to server env
    const classHash = clientClassHash || process.env.STARKNET_READY_CLASSHASH;
    if (!classHash) {
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
      return NextResponse.json(
        { error: "Paymaster not configured" },
        { status: 500 },
      );
    }

    let config;
    try {
      config = await setupPaymaster();
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message || "Failed to initialize paymaster" },
        { status: 500 },
      );
    }
    const { paymasterRpc, isSponsored, gasToken } = config;

    // Build account without paymaster (user pays gas for transfers)
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

    return NextResponse.json({
      success: true,
      transactionHash: result.transaction_hash,
      walletId,
      address,
      amount: amount.toString(),
      recipient: recipientAddress,
    });
  } catch (error: any) {
    console.error("[API] Error in Starknet transfer:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process transfer" },
      { status: 500 },
    );
  }
}
