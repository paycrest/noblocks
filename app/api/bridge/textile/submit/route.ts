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
  parseJsonObjectBody,
  validateTextileSubmitBody,
} from "@/app/lib/textileServer";

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
    const validation = validateTextileSubmitBody(body);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    trackApiRequest(request, "/api/bridge/textile/submit", "POST", {
      swap_id: body.swapId,
    });

    const { data, status } = await axios.post(
      `${TEXTILE_API_BASE}/swaps/${encodeURIComponent(body.swapId as string)}/submit`,
      { txHash: body.txHash },
      {
        headers: {
          ...textileAuthHeaders(),
          "Content-Type": "application/json",
        },
        validateStatus: () => true,
        timeout: TEXTILE_UPSTREAM_TIMEOUT_MS,
      },
    );

    trackApiResponse(
      "/api/bridge/textile/submit",
      "POST",
      status,
      Date.now() - startTime,
    );
    return NextResponse.json(data, { status });
  } catch (err) {
    trackApiError(request, "/api/bridge/textile/submit", "POST", err as Error, 502, {
      response_time_ms: Date.now() - startTime,
    });
    return NextResponse.json(
      { error: "Failed to submit Textile swap" },
      { status: 502 },
    );
  }
});
