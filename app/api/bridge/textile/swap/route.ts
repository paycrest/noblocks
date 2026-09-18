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
  TEXTILE_RFQ_REQUEST_TIMEOUT_MS,
  textileAuthHeaders,
  parseJsonObjectBody,
  validateTextileRequestBody,
} from "@/app/lib/textileServer";

/** Proxies Textile v2 RFQ request (firm quote + transactions on confirm). */
export const POST = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();
  try {
    let parsed: unknown;
    try {
      parsed = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const objectBody = parseJsonObjectBody(parsed);
    if (!objectBody.ok) {
      return NextResponse.json({ error: objectBody.error }, { status: 400 });
    }

    const body = objectBody.body;
    const validation = validateTextileRequestBody(body);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    trackApiRequest(request, "/api/bridge/textile/swap", "POST", {
      chain_id: body.chainId,
      sell_token: body.sellToken,
      buy_token: body.buyToken,
    });

    const { data, status } = await axios.post(
      `${TEXTILE_API_V2_BASE}/rfq/request`,
      {
        chainId: body.chainId,
        sellToken: body.sellToken,
        buyToken: body.buyToken,
        sellAmount: body.sellAmount,
        taker: body.taker,
      },
      {
        headers: {
          ...textileAuthHeaders(),
          "Content-Type": "application/json",
        },
        validateStatus: () => true,
        timeout: TEXTILE_RFQ_REQUEST_TIMEOUT_MS,
      },
    );

    trackApiResponse(
      "/api/bridge/textile/swap",
      "POST",
      status,
      Date.now() - startTime,
    );
    return NextResponse.json(data, { status });
  } catch (err) {
    trackApiError(request, "/api/bridge/textile/swap", "POST", err as Error, 502, {
      response_time_ms: Date.now() - startTime,
    });
    return NextResponse.json(
      { error: "Failed to request Textile RFQ" },
      { status: 502 },
    );
  }
});
