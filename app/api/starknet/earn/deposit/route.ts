import { NextRequest, NextResponse } from "next/server";
import { verifyJWT } from "@/app/lib/jwt";
import {
  DEFAULT_PRIVY_CONFIG,
  STARKNET_READY_ACCOUNT_CLASSHASH,
} from "@/app/lib/config";
import {
  buildReadyAccount,
  computeReadyAddress,
  deployReadyAccount,
  getRpcProvider,
  getStarknetWallet,
  setupPaymaster,
} from "@/app/lib/starknet";
import { prepareVesuDepositCalls, type EarnTokenSymbol } from "@/app/lib/earn";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiError,
  trackApiRequest,
  trackApiResponse,
} from "@/app/lib/server-analytics";

const ROUTE = "/api/starknet/earn/deposit";

export const POST = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    // Auth is JWT-only: the noblocks middleware (middleware.ts) matcher does
    // not include /api/starknet/earn/*, so x-wallet-address isn't pre-set.
    // Verifying the Privy JWT directly here is the same security model as the
    // position GET route and as the existing pattern for any route outside the
    // middleware matcher. We don't add /api/starknet/earn/* to the matcher to
    // avoid touching noblocks' shared auth plumbing.
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      trackApiError(
        request,
        ROUTE,
        "POST",
        new Error("Missing or invalid authorization header"),
        401,
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
      );
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
      origin: clientOrigin,
      token: rawTokenSymbol,
    } = body as {
      walletId?: string;
      publicKey?: string;
      classHash?: string;
      amount?: string | number;
      origin?: string;
      token?: string;
    };

    // Default to USDC for back-compat with old callers; validate explicit values.
    const tokenSymbol: EarnTokenSymbol =
      rawTokenSymbol === "USDT" ? "USDT" : "USDC";
    if (rawTokenSymbol && rawTokenSymbol !== "USDC" && rawTokenSymbol !== "USDT") {
      return NextResponse.json(
        { error: `Unsupported earn token: ${rawTokenSymbol}` },
        { status: 400 },
      );
    }

    if (!walletId || !publicKey) {
      trackApiError(
        request,
        ROUTE,
        "POST",
        new Error("Missing required fields"),
        400,
        { wallet_address: walletAddress },
      );
      return NextResponse.json(
        {
          error: "Missing required fields",
          missing: { walletId: !walletId, publicKey: !publicKey },
        },
        { status: 400 },
      );
    }

    if (amount === undefined || amount === null || amount === "") {
      return NextResponse.json(
        { error: "Missing amount parameter" },
        { status: 400 },
      );
    }

    let amountBaseUnits: bigint;
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

    let paymasterCfg;
    try {
      paymasterCfg = await setupPaymaster();
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
    const { paymasterRpc, isSponsored, gasToken } = paymasterCfg;

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
      calls = await prepareVesuDepositCalls({
        walletAddress: address,
        amountBaseUnits,
        tokenSymbol,
      });
    } catch (e: any) {
      trackApiError(
        request,
        ROUTE,
        "POST",
        new Error(e?.message || "Failed to prepare Vesu deposit"),
        500,
        { wallet_address: walletAddress },
      );
      return NextResponse.json(
        { error: e?.message || "Failed to prepare Vesu deposit" },
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
        trackApiError(request, ROUTE, "POST", error, 500, {
          wallet_address: walletAddress,
        });
        return NextResponse.json(
          { error: `Fee estimation failed: ${error.message}` },
          { status: 500 },
        );
      }
    }

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
      console.log(
        "[API] Warning: Could not confirm transaction, but it may still succeed",
      );
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
      amount: amountBaseUnits.toString(),
    });
  } catch (error: unknown) {
    const responseTime = Date.now() - startTime;
    const err =
      error instanceof Error ? error : new Error("Failed to process deposit");
    const wa = request.headers.get("x-wallet-address")?.toLowerCase();
    trackApiError(request, ROUTE, "POST", err, 500, {
      ...(wa ? { wallet_address: wa } : {}),
      response_time_ms: responseTime,
    });
    return NextResponse.json(
      { error: err.message || "Failed to process deposit" },
      { status: 500 },
    );
  }
});
