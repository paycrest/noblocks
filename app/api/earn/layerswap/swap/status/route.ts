import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import { getLayerswapApiKey, layerswapGetSwap } from "@/app/lib/layerswap";

export const GET = withRateLimit(async (request: NextRequest) => {
  const apiKey = getLayerswapApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "LayerSwap is not configured" },
      { status: 503 },
    );
  }

  const swapId = request.nextUrl.searchParams.get("id") || "";
  if (!swapId) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const data = await layerswapGetSwap({ apiKey, swapId });
    return NextResponse.json({ success: true, ...data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Swap lookup failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
});
