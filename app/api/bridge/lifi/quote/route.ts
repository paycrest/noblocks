import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiRequest,
  trackApiResponse,
  trackApiError,
} from "@/app/lib/server-analytics";

const LIFI_QUOTE_URL = "https://li.quest/v1/quote";

export const GET = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();
  try {
    const apiKey = process.env.LIFI_API_KEY || "";
    const params = Object.fromEntries(request.nextUrl.searchParams.entries());

    trackApiRequest(request, "/api/bridge/lifi/quote", "GET", {
      from_chain: params.fromChain,
      to_chain: params.toChain,
      from_token: params.fromToken,
      to_token: params.toToken,
    });

    const headers: Record<string, string> = {};
    if (apiKey) headers["x-lifi-api-key"] = apiKey;

    const { data, status } = await axios.get(LIFI_QUOTE_URL, {
      params,
      headers,
      validateStatus: () => true,
    });

    trackApiResponse("/api/bridge/lifi/quote", "GET", status, Date.now() - startTime);
    return NextResponse.json(data, { status });
  } catch (err) {
    trackApiError(request, "/api/bridge/lifi/quote", "GET", err as Error, 502, {
      response_time_ms: Date.now() - startTime,
    });
    return NextResponse.json(
      { error: "Failed to fetch LI.FI quote" },
      { status: 502 },
    );
  }
});
