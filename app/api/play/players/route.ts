import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";
import { getFantasySettings } from "@/app/lib/fantasy/settings";
import {
  fantasyDisabledResponse,
  getCurrentMatchday,
  isFantasyEnabled,
  jsonError,
} from "@/app/lib/fantasy/server";
import { NextResponse } from "next/server";

/**
 * GET /api/play/players — public player pool with prices, plus the game
 * settings the squad builder needs. Served from our DB only (user traffic
 * never reaches the data provider) and edge-cached for 5 minutes.
 */
export const GET = withRateLimit(async (_request: NextRequest) => {
  if (!isFantasyEnabled()) return fantasyDisabledResponse();

  try {
    const [{ data, error }, settings, matchday] = await Promise.all([
      supabaseAdmin
        .from("fantasy_players")
        .select("provider_player_id, team_id, name, nation, position, price, photo_url, is_active")
        .order("price", { ascending: false }),
      getFantasySettings(),
      getCurrentMatchday(),
    ]);
    if (error) throw error;

    return NextResponse.json(
      {
        success: true,
        data: {
          players: data ?? [],
          settings: {
            budget: settings.budget,
            squad_size: settings.squad_size,
            positions: settings.positions,
            formations: settings.formations,
            nation_cap: matchday ? settings.nation_caps[`MD${matchday.id}`] ?? null : null,
            transfer_penalty: settings.transfer_penalty,
            scoring: settings.scoring,
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
