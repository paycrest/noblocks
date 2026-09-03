import { NextRequest, NextResponse } from "next/server";
import { withRateLimitAndAnalytics } from "@/app/lib/analytics-middleware";
import { getPlayersMap } from "@/app/lib/fantasy/players";
import { getFantasySettings } from "@/app/lib/fantasy/settings";
import {
  fantasyDisabledResponse,
  getCurrentMatchday,
  isFantasyEnabled,
  jsonError,
} from "@/app/lib/fantasy/server";

/**
 * GET /api/play/players — public player pool + builder settings.
 * Uses the shared players cache (same source as squad/transfers validation).
 */
export const GET = withRateLimitAndAnalytics(async (_request: NextRequest) => {
  if (!isFantasyEnabled()) return fantasyDisabledResponse();

  try {
    const [settings, matchday, playersMap] = await Promise.all([
      getFantasySettings(),
      getCurrentMatchday(),
      getPlayersMap(),
    ]);

    const players = [...playersMap.values()]
      .sort((a, b) => Number(b.price) - Number(a.price))
      .map((p) => ({
        ...p,
        photo_url: settings.photos_enabled ? p.photo_url : null,
      }));

    return NextResponse.json(
      {
        success: true,
        data: {
          players,
          settings: {
            budget: settings.budget,
            squad_size: settings.squad_size,
            positions: settings.positions,
            formations: settings.formations,
            club_cap: settings.club_cap,
            transfer_penalty: settings.transfer_penalty,
            free_transfers_max: settings.free_transfers_max,
            photos_enabled: settings.photos_enabled,
            scoring: settings.scoring,
            defcon_def_threshold: settings.defcon_def_threshold,
            defcon_mid_fwd_threshold: settings.defcon_mid_fwd_threshold,
          },
          matchday,
        },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (error) {
    console.error("[play] players fetch failed:", error);
    return jsonError("Failed to load players", 500);
  }
});
