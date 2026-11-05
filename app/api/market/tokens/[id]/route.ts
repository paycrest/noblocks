import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiError,
  trackApiRequest,
  trackApiResponse,
} from "@/app/lib/server-analytics";
import { getRegistryEntry, isValidMarketTokenId } from "@/app/lib/market-data/assets";
import {
  PriceUnavailableError,
  getTokenMarketSnapshot,
} from "@/app/lib/market-data/service";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withRateLimit(async (request: NextRequest, context: RouteContext) => {
  const start = Date.now();
  const { id: rawId } = await context.params;
  const id = rawId?.toLowerCase() ?? "";
  const path = `/api/market/tokens/${id}`;
  trackApiRequest(request, path, "GET", { id });

  if (!isValidMarketTokenId(id) || !getRegistryEntry(id)) {
    trackApiResponse(path, "GET", 404, Date.now() - start, { id });
    return NextResponse.json(
      { success: false, error: "Token not found" },
      { status: 404 },
    );
  }

  try {
    const data = await getTokenMarketSnapshot(id);
    trackApiResponse(path, "GET", 200, Date.now() - start, { id });
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
        { success: false, error: err.message },
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
