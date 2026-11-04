import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiError,
  trackApiRequest,
  trackApiResponse,
} from "@/app/lib/server-analytics";
import {
  getRegistryEntry,
  isValidMarketTokenId,
  parseHistoryRange,
} from "@/app/lib/market-data/assets";
import {
  PriceUnavailableError,
  getTokenHistory,
} from "@/app/lib/market-data/service";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withRateLimit(async (request: NextRequest, context: RouteContext) => {
  const start = Date.now();
  const { id: rawId } = await context.params;
  const id = rawId?.toLowerCase() ?? "";
  const rangeRaw = request.nextUrl.searchParams.get("range");
  const range = parseHistoryRange(rangeRaw);
  const path = `/api/market/tokens/${id}/history`;
  trackApiRequest(request, path, "GET", { id, range: rangeRaw });

  if (!isValidMarketTokenId(id) || !getRegistryEntry(id)) {
    trackApiResponse(path, "GET", 404, Date.now() - start, { id });
    return NextResponse.json(
      { success: false, error: "Token not found" },
      { status: 404 },
    );
  }

  if (!range) {
    trackApiResponse(path, "GET", 400, Date.now() - start, { id });
    return NextResponse.json(
      { success: false, error: "Invalid range" },
      { status: 400 },
    );
  }

  try {
    const data = await getTokenHistory(id, range);
    trackApiResponse(path, "GET", 200, Date.now() - start, { id, range });
    return NextResponse.json(
      { success: true, data },
      {
        headers: {
          "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
        },
      },
    );
  } catch (err) {
    if (err instanceof PriceUnavailableError) {
      trackApiResponse(path, "GET", 503, Date.now() - start, { id });
      return NextResponse.json(
        {
          success: false,
          error: "Price data unavailable",
          data: {
            id,
            range,
            points: [],
            stale: true,
            unavailable: true,
          },
        },
        { status: 503 },
      );
    }
    trackApiError(request, path, "GET", err as Error, 500, {
      id,
      response_time_ms: Date.now() - start,
    });
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 },
    );
  }
});
