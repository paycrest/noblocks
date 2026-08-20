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
} from "@/app/lib/textileServer";

export const GET = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();
  try {
    const swapId = request.nextUrl.searchParams.get("swapId");
    if (!swapId) {
      return NextResponse.json({ error: "swapId required" }, { status: 400 });
    }

    trackApiRequest(request, "/api/bridge/textile/status", "GET", {
      swap_id: swapId,
    });

    const { data, status } = await axios.get(
      `${TEXTILE_API_BASE}/swaps/${encodeURIComponent(swapId)}`,
      {
        headers: textileAuthHeaders(),
        validateStatus: () => true,
        timeout: TEXTILE_UPSTREAM_TIMEOUT_MS,
      },
    );

    trackApiResponse(
      "/api/bridge/textile/status",
      "GET",
      status,
      Date.now() - startTime,
    );
    return NextResponse.json(data, { status });
  } catch (err) {
    trackApiError(request, "/api/bridge/textile/status", "GET", err as Error, 502, {
      response_time_ms: Date.now() - startTime,
    });
    return NextResponse.json(
      { error: "Failed to fetch Textile swap status" },
      { status: 502 },
    );
  }
});
