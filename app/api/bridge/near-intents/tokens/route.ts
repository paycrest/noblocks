import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiRequest,
  trackApiResponse,
  trackApiError,
} from "@/app/lib/server-analytics";

const ONE_CLICK_URL = "https://1click.chaindefuser.com/v0/tokens";
const UPSTREAM_TIMEOUT_MS = 5_000;

let cached: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export const GET = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();
  trackApiRequest(request, "/api/bridge/near-intents/tokens", "GET", {});

  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    trackApiResponse(
      "/api/bridge/near-intents/tokens",
      "GET",
      200,
      Date.now() - startTime,
      { cache: "hit" },
    );
    return NextResponse.json(cached.data);
  }
  try {
    const jwt = process.env.ONE_CLICK_JWT || "";
    const { data, status } = await axios.get(ONE_CLICK_URL, {
      headers: jwt ? { Authorization: `Bearer ${jwt}` } : undefined,
      timeout: UPSTREAM_TIMEOUT_MS,
      validateStatus: () => true,
    });
    // Only cache successful array responses — caching an upstream error body would
    // poison every NEAR quote for the full TTL (resolveNearAssetId gets [] → "no rail").
    if (status >= 200 && status < 300 && Array.isArray(data)) {
      cached = { data, ts: Date.now() };
      trackApiResponse(
        "/api/bridge/near-intents/tokens",
        "GET",
        status,
        Date.now() - startTime,
        { cache: "miss" },
      );
      return NextResponse.json(data);
    }
    // Upstream returned a non-2xx or non-array body.
    trackApiResponse(
      "/api/bridge/near-intents/tokens",
      "GET",
      status,
      Date.now() - startTime,
      { cache: cached ? "stale-fallback" : "none" },
    );
    if (cached) return NextResponse.json(cached.data);
    return NextResponse.json(
      { error: "Failed to fetch NEAR Intents tokens" },
      { status: 502 },
    );
  } catch (err) {
    trackApiError(
      request,
      "/api/bridge/near-intents/tokens",
      "GET",
      err as Error,
      502,
      {
        response_time_ms: Date.now() - startTime,
        cache: cached ? "stale-fallback" : "none",
      },
    );
    if (cached) return NextResponse.json(cached.data);
    return NextResponse.json(
      { error: "Failed to fetch NEAR Intents tokens" },
      { status: 502 },
    );
  }
});
