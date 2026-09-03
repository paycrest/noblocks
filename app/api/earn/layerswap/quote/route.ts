import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import { getLayerswapApiKey, layerswapGetQuote } from "@/app/lib/layerswap";
import { layerswapSourceNetwork } from "@/app/lib/earnChains";
import { parseLayerswapAmountParam } from "@/app/lib/layerswapValidation";

export const GET = withRateLimit(async (request: NextRequest) => {
  const apiKey = getLayerswapApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "LayerSwap is not configured" },
      { status: 503 },
    );
  }

  const sourceChain = request.nextUrl.searchParams.get("sourceChain") || "";
  const amount = parseLayerswapAmountParam(
    request.nextUrl.searchParams.get("amount"),
  );
  const destinationAddress =
    request.nextUrl.searchParams.get("destinationAddress") || "";

  const sourceNetwork = layerswapSourceNetwork(sourceChain);
  if (!sourceNetwork || !destinationAddress || amount === null) {
    return NextResponse.json(
      { error: "sourceChain, amount, and destinationAddress are required" },
      { status: 400 },
    );
  }

  try {
    const quote = await layerswapGetQuote({
      apiKey,
      sourceNetwork,
      amount,
      destinationAddress,
    });
    return NextResponse.json({ success: true, quote });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Quote failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
});
