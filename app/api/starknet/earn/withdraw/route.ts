import { NextRequest, NextResponse } from "next/server";
import { verifyJWT } from "@/app/lib/jwt";
import {
  DEFAULT_PRIVY_CONFIG,
  STARKNET_READY_ACCOUNT_CLASSHASH,
} from "@/app/lib/config";
import {
  buildReadyAccount,
  computeReadyAddress,
  getRpcProvider,
  getStarknetWallet,
  setupPaymaster,
} from "@/app/lib/starknet";
import {
  prepareVesuWithdrawCalls,
  prepareVesuWithdrawMaxCalls,
  type EarnTokenSymbol,
} from "@/app/lib/earn";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiError,
  trackApiRequest,
  trackApiResponse,
} from "@/app/lib/server-analytics";

const ROUTE = "/api/starknet/earn/withdraw";

export const POST = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    // JWT-only auth — see deposit route for rationale.
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

    const walletAddress = request.headers
      .get("x-wallet-address")
      ?.toLowerCase();

    trackApiRequest(request, ROUTE, "POST", {
      ...(walletAddress ? { wallet_address: walletAddress } : {}),
      privy_user_id: authUserId,
    });

    const body = await request.json();
    const {
      walletId,
      publicKey,
      classHash: clientClassHash,
      amount,
      max,
      origin: clientOrigin,
      token: rawTokenSymbol,
    } = body as {
      walletId?: string;
      publicKey?: string;
      classHash?: string;
      amount?: string | number;
      max?: boolean;
      origin?: string;
      token?: string;
    };

    const tokenSymbol: EarnTokenSymbol =
      rawTokenSymbol === "USDT" ? "USDT" : "USDC";
    if (rawTokenSymbol && rawTokenSymbol !== "USDC" && rawTokenSymbol !== "USDT") {
      return NextResponse.json(
        { error: `Unsupported earn token: ${rawTokenSymbol}` },
        { status: 400 },
      );
    }

    if (!walletId || !publicKey) {
      return NextResponse.json(
        {
          error: "Missing required fields",
          missing: {
            walletId: !walletId,
            publicKey: !publicKey,
          },
        },
        { status: 400 },
      );
    }

    let amountBaseUnits: bigint = BigInt("0");
    if (!max) {
      if (amount === undefined || amount === null || amount === "") {
        return NextResponse.json(
          { error: "Missing amount parameter (or set max=true)" },
          { status: 400 },
        );
      }
      try {
        amountBaseUnits = BigInt(amount as string | number);
      } catch {
        return NextResponse.json(
          { error: `Amount must be an integer in ${tokenSymbol} base units` },
          { status: 400 },
        );
      }
      if (amountBaseUnits <= BigInt("0")) {
        return NextResponse.json(
          { error: "Amount must be greater than zero" },
          { status: 400 },
        );
      }
    }

    const classHash = clientClassHash || STARKNET_READY_ACCOUNT_CLASSHASH;
    const origin = clientOrigin || request.headers.get("origin") || undefined;

    const { publicKey: walletPublicKey } = await getStarknetWallet(walletId);
    const address = computeReadyAddress(walletPublicKey, classHash);

    let isDeployed = false;
    const provider = getRpcProvider();
    try {
      await provider.getClassHashAt(address);
      isDeployed = true;
    } catch {
      isDeployed = false;
    }

    if (!isDeployed) {
      return NextResponse.json(
        { error: "Cannot withdraw before account is deployed" },
        { status: 400 },
      );
    }

    const { paymasterRpc, isSponsored, gasToken } = await setupPaymaster();

    const { account } = await buildReadyAccount({
      walletId,
      publicKey: walletPublicKey,
      classHash,
      userJwt: token,
      userId: authUserId,
      origin,
      paymasterRpc,
    });

    let calls;
    try {
      calls = max
        ? await prepareVesuWithdrawMaxCalls({
            walletAddress: address,
            tokenSymbol,
          })
        : await prepareVesuWithdrawCalls({
            walletAddress: address,
            amountBaseUnits,
            tokenSymbol,
          });
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message || "Failed to prepare Vesu withdraw" },
        { status: 500 },
      );
    }

    const paymasterDetails: any = isSponsored
      ? { feeMode: { mode: "sponsored" as const } }
      : { feeMode: { mode: "default" as const, gasToken } };

    let maxFee: any = undefined;
    if (!isSponsored) {
      try {
        const est = await account.estimatePaymasterTransactionFee(
          calls,
          paymasterDetails,
        );
        const withMargin15 = (v: any) => {
          const bi = BigInt(v.toString());
          return (bi * BigInt(3) + BigInt(1)) / BigInt(2);
        };
        maxFee = withMargin15(est.suggested_max_fee_in_gas_token);
      } catch (error: any) {
        return NextResponse.json(
          { error: `Fee estimation failed: ${error.message}` },
          { status: 500 },
        );
      }
    }

    let result;
    try {
      result = await account.executePaymasterTransaction(
        calls,
        paymasterDetails,
        maxFee,
      );
    } catch (error: any) {
      trackApiError(request, ROUTE, "POST", error, 500, {
        wallet_address: walletAddress,
      });
      return NextResponse.json(
        { error: error.message || "Failed to execute transaction" },
        { status: 500 },
      );
    }

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
    } catch {
      // Soft-fail confirmation
    }

    const responseTime = Date.now() - startTime;
    trackApiResponse(ROUTE, "POST", 200, responseTime, {
      wallet_address: walletAddress,
      privy_user_id: authUserId,
    });

    return NextResponse.json({
      success: true,
      transactionHash: result.transaction_hash,
      walletId,
      address,
      amount: max ? null : amountBaseUnits.toString(),
      max: !!max,
    });
  } catch (error: unknown) {
    const responseTime = Date.now() - startTime;
    const err =
      error instanceof Error ? error : new Error("Failed to process withdraw");
    const wa = request.headers.get("x-wallet-address")?.toLowerCase();
    trackApiError(request, ROUTE, "POST", err, 500, {
      ...(wa ? { wallet_address: wa } : {}),
      response_time_ms: responseTime,
    });
    return NextResponse.json(
      { error: err.message || "Failed to process withdraw" },
      { status: 500 },
    );
  }
});
