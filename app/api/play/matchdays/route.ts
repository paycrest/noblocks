import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  fantasyDisabledResponse,
  getMatchdays,
  isFantasyEnabled,
  jsonError,
} from "@/app/lib/fantasy/server";

/**
 * GET /api/play/matchdays — public list of all rounds (id, name, lock,
 * status) for the round-progress strip. DB-only, briefly cached.
 */
export const GET = withRateLimit(async (_request: NextRequest) => {
  if (!isFantasyEnabled()) return fantasyDisabledResponse();

  try {
    const matchdays = await getMatchdays();
    return NextResponse.json(
      { success: true, data: { matchdays } },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } },
    );
  } catch (error) {
    console.error("[play] matchdays fetch failed:", error);
    return jsonError("Failed to load matchdays", 500);
  }
});
