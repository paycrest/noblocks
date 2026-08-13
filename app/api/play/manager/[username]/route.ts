import { NextRequest, NextResponse } from "next/server";
import { withRateLimitAndAnalytics } from "@/app/lib/analytics-middleware";
import {
  fantasyDisabledResponse,
  getPublicManagerTeam,
  isFantasyEnabled,
  jsonError,
} from "@/app/lib/fantasy/server";

/**
 * GET /api/play/manager/[username] — public view of a manager's team:
 * rank, total points and the squad for the most recent LOCKED matchday
 * (open-round picks never leak). `team` is null until they have one.
 */
export const GET = withRateLimitAndAnalytics(
  async (
    _request: NextRequest,
    context: { params: Promise<{ username: string }> },
  ) => {
    if (!isFantasyEnabled()) return fantasyDisabledResponse();

    try {
      const { username } = await context.params;
      const manager = await getPublicManagerTeam(username);
      if (!manager) return jsonError("Manager not found", 404);

      return NextResponse.json(
        { success: true, data: manager },
        { headers: { "Cache-Control": "public, s-maxage=30" } },
      );
    } catch (error) {
      console.error("[play] manager team fetch failed:", error);
      return jsonError("Failed to load manager", 500);
    }
  },
);
