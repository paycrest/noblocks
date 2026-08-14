import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimitAndAnalytics } from "@/app/lib/analytics-middleware";
import { getFantasySettings } from "@/app/lib/fantasy/settings";
import {
  fantasyDisabledResponse,
  isFantasyEnabled,
  jsonError,
} from "@/app/lib/fantasy/server";

/**
 * GET /api/play/matchday/[id] — public matchday summary: fixtures, scores,
 * status. Served from our DB (never the provider) and briefly cached.
 */
export const GET = withRateLimitAndAnalytics(
  async (_request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    if (!isFantasyEnabled()) return fantasyDisabledResponse();

    try {
      const { id } = await context.params;
      const matchdayId = Number(id);
      if (!Number.isInteger(matchdayId)) return jsonError("Invalid matchday", 400);

      const settings = await getFantasySettings();
      if (
        matchdayId < settings.season_matchday_min ||
        matchdayId > settings.season_matchday_max
      ) {
        return jsonError("Matchday not found", 404);
      }

      const [{ data: matchday, error: mdError }, { data: fixtures, error: fxError }] =
        await Promise.all([
          supabaseAdmin
            .from("fantasy_matchdays")
            .select("id, label, display_name, lock_at, status")
            .eq("id", matchdayId)
            .maybeSingle(),
          supabaseAdmin
            .from("fantasy_fixtures")
            .select(
              "provider_fixture_id, home_team, away_team, home_team_id, away_team_id, kickoff, status, home_score, away_score",
            )
            .eq("matchday_id", matchdayId)
            .order("kickoff", { ascending: true }),
        ]);
      if (mdError) throw mdError;
      if (fxError) throw fxError;
      if (!matchday) return jsonError("Matchday not found", 404);

      return NextResponse.json(
        { success: true, data: { matchday, fixtures: fixtures ?? [] } },
        { headers: { "Cache-Control": "public, s-maxage=30" } },
      );
    } catch (error) {
      console.error("[play] matchday fetch failed:", error);
      return jsonError("Failed to load matchday", 500);
    }
  },
);
