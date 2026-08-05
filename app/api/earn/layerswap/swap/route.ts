import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  getLayerswapApiKey,
  layerswapCreateEarnSwap,
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
    sourceChain,
    amount,
    destinationAddress,
    sourceAddress,
    refundAddress,
  } = body as {
    sourceChain?: string;
    amount?: number;
    destinationAddress?: string;
    sourceAddress?: string;
    refundAddress?: string;
  };

  if (!sourceChain || !destinationAddress || !(Number(amount) > 0)) {
    return NextResponse.json(
      { error: "sourceChain, amount, and destinationAddress are required" },
      { status: 400 },
    );
  }

  try {
    const prepared = await layerswapCreateEarnSwap({
      apiKey,
      sourceChainName: sourceChain,
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
