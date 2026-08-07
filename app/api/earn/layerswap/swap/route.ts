import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  getLayerswapApiKey,
  layerswapCreateEarnSwap,
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
    sourceChain,
    amount,
    destinationAddress,
    sourceAddress,
    refundAddress,
    walletId,
  } = (body ?? {}) as {
    sourceChain?: string;
    amount?: number | string;
    destinationAddress?: string;
    sourceAddress?: string;
    refundAddress?: string;
    walletId?: string;
  };

  const parsedAmount = parseLayerswapAmountBody(amount);
  if (!sourceChain || !destinationAddress || parsedAmount === null) {
    return NextResponse.json(
      { error: "sourceChain, amount, and destinationAddress are required" },
      { status: 400 },
    );
  }
  if (!walletId) {
    return NextResponse.json({ error: "walletId is required" }, { status: 400 });
  }
  if (!sourceAddress) {
    return NextResponse.json({ error: "sourceAddress is required" }, { status: 400 });
  }

  try {
    const [evmOwned, starknetOwned] = await Promise.all([
      assertEvmAddressOwnedByUser(auth.userId, sourceAddress),
      assertStarknetAddressOwnedByUser(
        auth.userId,
        walletId,
        destinationAddress,
      ),
    ]);
    if (!evmOwned) {
      return NextResponse.json(
        { error: "sourceAddress does not belong to the authenticated user" },
        { status: 403 },
      );
    }
    if (!starknetOwned) {
      return NextResponse.json(
        {
          error:
            "destinationAddress does not belong to the authenticated user",
        },
        { status: 403 },
      );
    }

    const prepared = await layerswapCreateEarnSwap({
      apiKey,
      sourceChainName: sourceChain,
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
