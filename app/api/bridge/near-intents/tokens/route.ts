import { NextResponse } from "next/server";
import axios from "axios";
import { withRateLimit } from "@/app/lib/rate-limit";

const ONE_CLICK_URL = "https://1click.chaindefuser.com/v0/tokens";

let cached: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export const GET = withRateLimit(async () => {
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }
  try {
    const jwt = process.env.ONE_CLICK_JWT || "";
    const { data, status } = await axios.get(ONE_CLICK_URL, {
      headers: jwt ? { Authorization: `Bearer ${jwt}` } : undefined,
      validateStatus: () => true,
    });
    // Only cache successful array responses — caching an upstream error body would
    // poison every NEAR quote for the full TTL (resolveNearAssetId gets [] → "no rail").
    if (status >= 200 && status < 300 && Array.isArray(data)) {
      cached = { data, ts: Date.now() };
      return NextResponse.json(data);
    }
    if (cached) return NextResponse.json(cached.data);
    return NextResponse.json(
      { error: "Failed to fetch NEAR Intents tokens" },
      { status: 502 },
    );
  } catch {
    if (cached) return NextResponse.json(cached.data);
    return NextResponse.json(
      { error: "Failed to fetch NEAR Intents tokens" },
      { status: 502 },
    );
  }
});
