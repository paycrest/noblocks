import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  getLayerswapApiKey,
  layerswapCreateEarnWithdrawSwap,
} from "@/app/lib/layerswap";

export const POST = withRateLimit(async (request: NextRequest) => {
  const apiKey = getLayerswapApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "LayerSwap is not configured" },
      { status: 503 },
    );
  }

  const body = await request.json();
  const {
    destinationChain,
    amount,
    destinationAddress,
    sourceAddress,
    refundAddress,
  } = body as {
    destinationChain?: string;
    amount?: number;
    destinationAddress?: string;
    sourceAddress?: string;
    refundAddress?: string;
  };

  if (!destinationChain || !destinationAddress || !(Number(amount) > 0)) {
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

  try {
    const prepared = await layerswapCreateEarnWithdrawSwap({
      apiKey,
      destinationChainName: destinationChain,
      amount: Number(amount),
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
