import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  getLayerswapApiKey,
  layerswapCreateEarnWithdrawSwap,
} from "@/app/lib/layerswap";
import { parseLayerswapAmountBody } from "@/app/lib/layerswapValidation";
import {
  assertEvmAddressOwnedByUser,
  assertStarknetAddressOwnedByUser,
  requireLayerswapAuth,
} from "@/app/lib/layerswapRouteAuth";

export const POST = withRateLimit(async (request: NextRequest) => {
  const apiKey = getLayerswapApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "LayerSwap is not configured" },
      { status: 503 },
    );
  }

  const authResult = await requireLayerswapAuth(request);
  if (!authResult.ok) return authResult.response;
  const { auth } = authResult;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    destinationChain,
    amount,
    destinationAddress,
    sourceAddress,
    refundAddress,
    walletId,
  } = (body ?? {}) as {
    destinationChain?: string;
    amount?: number | string;
    destinationAddress?: string;
    sourceAddress?: string;
    refundAddress?: string;
    walletId?: string;
  };

  const parsedAmount = parseLayerswapAmountBody(amount);
  if (!destinationChain || !destinationAddress || parsedAmount === null) {
    return NextResponse.json(
      {
        error:
          "destinationChain, amount, and destinationAddress are required",
      },
      { status: 400 },
    );
  }
  if (!sourceAddress) {
    return NextResponse.json(
      { error: "sourceAddress (Starknet) is required" },
      { status: 400 },
    );
  }
  if (!walletId) {
    return NextResponse.json({ error: "walletId is required" }, { status: 400 });
  }

  try {
    const [starknetOwned, evmOwned] = await Promise.all([
      assertStarknetAddressOwnedByUser(auth.userId, walletId, sourceAddress),
      assertEvmAddressOwnedByUser(auth.userId, destinationAddress),
    ]);
    if (!starknetOwned) {
      return NextResponse.json(
        { error: "sourceAddress does not belong to the authenticated user" },
        { status: 403 },
      );
    }
    if (!evmOwned) {
      return NextResponse.json(
        {
          error:
            "destinationAddress does not belong to the authenticated user",
        },
        { status: 403 },
      );
    }

    const prepared = await layerswapCreateEarnWithdrawSwap({
      apiKey,
      destinationChainName: destinationChain,
      amount: parsedAmount,
      destinationAddress,
      sourceAddress,
      refundAddress,
    });
    return NextResponse.json({ success: true, ...prepared });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Swap creation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
});
