import { NextRequest, NextResponse } from "next/server";
import { verifyJWT } from "@/app/lib/jwt";
import {
  DEFAULT_PRIVY_CONFIG,
  STARKNET_READY_ACCOUNT_CLASSHASH,
} from "@/app/lib/config";
import {
  applySafetyMargin,
  buildReadyAccount,
  getStarknetWallet,
  setupPaymaster,
} from "@/app/lib/starknet";
import type { LayerswapDepositAction } from "@/app/lib/layerswap";
import { layerswapDepositActionsToStarknetCalls } from "@/app/lib/layerswap";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiError,
  trackApiRequest,
  trackApiResponse,
} from "@/app/lib/server-analytics";

const ROUTE = "/api/earn/layerswap/starknet-deposit";

export const POST = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();

  try {
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

    trackApiRequest(request, ROUTE, "POST", { privy_user_id: authUserId });

    const body = await request.json();
    const {
      walletId,
      publicKey,
      classHash: clientClassHash,
      origin: clientOrigin,
      depositActions,
    } = body as {
      walletId?: string;
      publicKey?: string;
      classHash?: string;
      origin?: string;
      depositActions?: LayerswapDepositAction[];
    };

    if (!walletId || !publicKey) {
      return NextResponse.json(
        { error: "Missing walletId or publicKey" },
        { status: 400 },
      );
    }
    if (!depositActions?.length) {
      return NextResponse.json(
        { error: "depositActions are required" },
        { status: 400 },
      );
    }

    const classHash = clientClassHash || STARKNET_READY_ACCOUNT_CLASSHASH;
    const origin = clientOrigin || request.headers.get("origin") || undefined;

    const { publicKey: walletPublicKey } = await getStarknetWallet(walletId);

    const paymasterCfg = await setupPaymaster();
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

    const calls = layerswapDepositActionsToStarknetCalls(depositActions);
    const paymasterDetails: any = isSponsored
      ? { feeMode: { mode: "sponsored" as const } }
      : { feeMode: { mode: "default" as const, gasToken } };

    let maxFee: any = undefined;
    if (!isSponsored) {
      const est = await account.estimatePaymasterTransactionFee(
        calls,
        paymasterDetails,
      );
      maxFee = applySafetyMargin(est.suggested_max_fee_in_gas_token);
    }

    const result = await account.executePaymasterTransaction(
      calls,
      paymasterDetails,
      maxFee,
    );

    let txReceipt;
    try {
      txReceipt = await account.waitForTransaction(result.transaction_hash, {
        retries: 60,
        retryInterval: 5_000,
      });
    } catch {
      return NextResponse.json(
        {
          error:
            "Transaction submitted but confirmation timed out. Check the explorer.",
          transactionHash: result.transaction_hash,
        },
        { status: 502 },
      );
    }
    if (!txReceipt.isSuccess()) {
      return NextResponse.json(
        {
          error: "LayerSwap Starknet deposit reverted on-chain",
          transactionHash: result.transaction_hash,
        },
        { status: 500 },
      );
    }

    const responseTime = Date.now() - startTime;
    trackApiResponse(ROUTE, "POST", 200, responseTime, {
      privy_user_id: authUserId,
    });

    return NextResponse.json({
      success: true,
      transactionHash: result.transaction_hash,
    });
  } catch (error: unknown) {
    const err =
      error instanceof Error ? error : new Error("Starknet deposit failed");
    trackApiError(request, ROUTE, "POST", err, 500);
    return NextResponse.json(
      { error: err.message || "Starknet deposit failed" },
      { status: 500 },
    );
  }
});
