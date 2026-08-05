import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import { getLayerswapApiKey, layerswapGetQuote } from "@/app/lib/layerswap";
import {
  LAYERSWAP_STARKNET_NETWORK,
  layerswapSourceNetwork,
} from "@/app/lib/earnChains";
import { parseLayerswapAmountParam } from "@/app/lib/layerswapValidation";

export const GET = withRateLimit(async (request: NextRequest) => {
  const apiKey = getLayerswapApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "LayerSwap is not configured" },
      { status: 503 },
    );
  }

  const destinationChain =
    request.nextUrl.searchParams.get("destinationChain") || "";
  const amount = parseLayerswapAmountParam(
    request.nextUrl.searchParams.get("amount"),
  );
  const destinationAddress =
    request.nextUrl.searchParams.get("destinationAddress") || "";

  const destinationNetwork = layerswapSourceNetwork(destinationChain);
  if (!destinationNetwork || !destinationAddress || amount === null) {
    return NextResponse.json(
      {
        error:
          "destinationChain, amount, and destinationAddress are required",
      },
      { status: 400 },
    );
  }

  try {
    const quote = await layerswapGetQuote({
      apiKey,
      sourceNetwork: LAYERSWAP_STARKNET_NETWORK,
      destinationNetwork,
      amount,
      destinationAddress,
    });
    return NextResponse.json({ success: true, quote });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Quote failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
});
