import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiRequest,
  trackApiResponse,
  trackApiError,
} from "@/app/lib/server-analytics";

const ONE_CLICK_QUOTE_URL = "https://1click.chaindefuser.com/v0/quote";

export const POST = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();
  try {
    const jwt = process.env.ONE_CLICK_JWT || "";
    if (!jwt) {
      return NextResponse.json(
        { error: "ONE_CLICK_JWT not configured" },
        { status: 500 },
      );
    }

    const body = await request.json();

    trackApiRequest(request, "/api/bridge/near-intents/quote", "POST", {
      origin_asset: body.originAsset,
      destination_asset: body.destinationAsset,
    });

    const { data, status } = await axios.post(ONE_CLICK_QUOTE_URL, body, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      validateStatus: () => true,
    });

    trackApiResponse("/api/bridge/near-intents/quote", "POST", status, Date.now() - startTime);
    return NextResponse.json(data, { status });
  } catch (err) {
    trackApiError(request, "/api/bridge/near-intents/quote", "POST", err as Error, 502, {
      response_time_ms: Date.now() - startTime,
    });
    return NextResponse.json(
      { error: "Failed to fetch NEAR Intents quote" },
      { status: 502 },
    );
  }
});
