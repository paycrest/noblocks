import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiRequest,
  trackApiResponse,
  trackApiError,
} from "@/app/lib/server-analytics";

const ONE_CLICK_STATUS_URL = "https://1click.chaindefuser.com/v0/status";

export const GET = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();
  try {
    const jwt = process.env.ONE_CLICK_JWT || "";
    const depositAddress = request.nextUrl.searchParams.get("depositAddress");
    if (!depositAddress) {
      return NextResponse.json(
        { error: "depositAddress query param required" },
        { status: 400 },
      );
    }

    trackApiRequest(request, "/api/bridge/near-intents/status", "GET", {
      deposit_address: depositAddress,
    });

    const { data, status } = await axios.get(ONE_CLICK_STATUS_URL, {
      params: { depositAddress },
      headers: jwt ? { Authorization: `Bearer ${jwt}` } : undefined,
      validateStatus: () => true,
    });

    trackApiResponse("/api/bridge/near-intents/status", "GET", status, Date.now() - startTime);
    return NextResponse.json(data, { status });
  } catch (err) {
    trackApiError(request, "/api/bridge/near-intents/status", "GET", err as Error, 502, {
      response_time_ms: Date.now() - startTime,
    });
    return NextResponse.json(
      { error: "Failed to fetch NEAR Intents status" },
      { status: 502 },
    );
  }
});
