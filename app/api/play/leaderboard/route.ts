import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimitAndAnalytics } from "@/app/lib/analytics-middleware";
import {
  fantasyDisabledResponse,
  getAuthedWallet,
  isFantasyEnabled,
  jsonError,
} from "@/app/lib/fantasy/server";

const PAGE_SIZE = 50;

/**
 * GET /api/play/leaderboard?page=&find=me — the one global leaderboard.
 * Public; passing a Bearer token personalizes (is_me + "find me" jump).
 * Exposes badge state only — other users' referral counts stay private
 * (PRD §7.3).
 */
export const GET = withRateLimitAndAnalytics(async (request: NextRequest) => {
  if (!isFantasyEnabled()) return fantasyDisabledResponse();

  try {
    const params = request.nextUrl.searchParams;
    const findMe = params.get("find") === "me";

    // Optional auth (route is public; token verified when present).
    const auth = request.headers.get("Authorization")
      ? await getAuthedWallet(request).catch(() => null)
      : null;

    let page = Math.max(1, Number(params.get("page")) || 1);

    if (findMe && auth) {
      const { data: mine } = await supabaseAdmin
        .from("fantasy_leaderboard")
        .select("rank")
        .eq("wallet_address", auth.walletAddress)
        .maybeSingle();
      if (mine?.rank) page = Math.ceil(Number(mine.rank) / PAGE_SIZE);
    }

    const from = (page - 1) * PAGE_SIZE;
    const [{ data, error }, { count }] = await Promise.all([
      supabaseAdmin
        .from("fantasy_leaderboard")
        .select("wallet_address, username, total_points, rank, previous_rank, badge")
        .order("rank", { ascending: true })
        .range(from, from + PAGE_SIZE - 1),
      supabaseAdmin
        .from("fantasy_participants")
        .select("wallet_address", { count: "exact", head: true }),
    ]);
    if (error) throw error;

    const rows = (data ?? []).map((row) => ({
      rank: Number(row.rank),
      username: row.username as string | null,
      total_points: Number(row.total_points),
      badge: row.badge as string,
      movement:
        row.previous_rank != null ? Number(row.previous_rank) - Number(row.rank) : 0,
      is_me: auth ? row.wallet_address === auth.walletAddress : false,
    }));

    return NextResponse.json(
      {
        success: true,
        data: {
          rows,
          page,
          page_size: PAGE_SIZE,
          total: count ?? rows.length,
        },
      },
      // Cache anonymous reads briefly; personalized reads stay fresh.
      auth ? undefined : { headers: { "Cache-Control": "public, s-maxage=30" } },
    );
  } catch (error) {
    console.error("[play] leaderboard fetch failed:", error);
    return jsonError("Failed to load leaderboard", 500);
  }
});
