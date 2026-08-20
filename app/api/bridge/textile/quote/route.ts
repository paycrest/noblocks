import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiRequest,
  trackApiResponse,
  trackApiError,
} from "@/app/lib/server-analytics";
import {
  TEXTILE_API_BASE,
  TEXTILE_UPSTREAM_TIMEOUT_MS,
  textileAuthHeaders,
  minRateRayFromEffective,
  isPositiveRayRate,
} from "@/app/lib/textileServer";

export const GET = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const slippageBps = Math.max(Number(params.slippageBps) || 50, 200);

    trackApiRequest(request, "/api/bridge/textile/quote", "GET", {
      chain_id: params.chainId,
      sell_token: params.sellToken,
      buy_token: params.buyToken,
    });

    const { data, status } = await axios.get(`${TEXTILE_API_BASE}/quote`, {
      params: {
        chainId: params.chainId,
        sellToken: params.sellToken,
        buyToken: params.buyToken,
        sellAmount: params.sellAmount,
        minRate: params.minRate ?? "0",
      },
      headers: textileAuthHeaders(),
      validateStatus: () => true,
      timeout: TEXTILE_UPSTREAM_TIMEOUT_MS,
    });

    trackApiResponse(
      "/api/bridge/textile/quote",
      "GET",
      status,
      Date.now() - startTime,
    );

    if (status >= 400) {
      return NextResponse.json(data, { status });
    }

    const quote = data?.data;
    if (quote?.effectiveRateRay && isPositiveRayRate(String(quote.effectiveRateRay))) {
      const minRateRay = minRateRayFromEffective(
        String(quote.effectiveRateRay),
        slippageBps,
      );
      if (isPositiveRayRate(minRateRay)) {
        quote.minRateRay = minRateRay;
      }
    }

    return NextResponse.json(data, { status });
  } catch (err) {
    trackApiError(request, "/api/bridge/textile/quote", "GET", err as Error, 502, {
      response_time_ms: Date.now() - startTime,
    });
    return NextResponse.json(
      { error: "Failed to fetch Textile quote" },
      { status: 502 },
    );
  }
});
