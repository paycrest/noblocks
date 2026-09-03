import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiRequest,
  trackApiResponse,
  trackApiError,
} from "@/app/lib/server-analytics";
import {
  TEXTILE_API_V2_BASE,
  TEXTILE_UPSTREAM_TIMEOUT_MS,
  textileAuthHeaders,
  textileRfqClaimHeaders,
} from "@/app/lib/textileServer";

export const GET = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();
  try {
    const rfqId =
      request.nextUrl.searchParams.get("rfqId") ??
      request.nextUrl.searchParams.get("swapId");
    if (!rfqId) {
      return NextResponse.json({ error: "rfqId required" }, { status: 400 });
    }

    const claimToken =
      request.nextUrl.searchParams.get("claimToken") ??
      request.headers.get("X-Rfq-Claim") ??
      undefined;

    trackApiRequest(request, "/api/bridge/textile/status", "GET", {
      rfq_id: rfqId,
    });

    const { data, status } = await axios.get(
      `${TEXTILE_API_V2_BASE}/rfq/${encodeURIComponent(rfqId)}`,
      {
        headers: {
          ...textileAuthHeaders(),
          ...textileRfqClaimHeaders(claimToken),
        },
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
      { error: "Failed to fetch Textile RFQ status" },
      { status: 502 },
    );
  }
});
