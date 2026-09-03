import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimitAndAnalytics } from "@/app/lib/analytics-middleware";
import { csvEscape, requireAdmin } from "@/app/lib/fantasy/admin";
import { jsonError, jsonOk } from "@/app/lib/fantasy/server";

/**
 * Ops helper ranks giveaway-opted-in managers. EPL prize engine is monthly
 * (100 USDC: GW challenges / MotM / bounty) — use Challenges CSV for GW pots.
 * MotM = 25 USDC to the top opted-in manager; remaining rows are unpriced here.
 * Ranking skips opted-out / disqualified rows (badge !== 'active').
 */
const PRIZES_USDC = [25];

const CSV_COLUMNS = [
  "position",
  "wallet_address",
  "username",
  "total_points",
  "rank",
  "prize_usdc",
] as const;

/**
 * GET /api/play/admin/winners?format=json|csv — winners export for payout.
 * Active giveaway participants only; `position` is prize order among them.
 */
export const GET = withRateLimitAndAnalytics(async (request: NextRequest) => {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const format =
      request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "json";

    const { data, error } = await supabaseAdmin
      .from("fantasy_leaderboard")
      .select("wallet_address, username, total_points, rank, badge")
      .eq("badge", "active")
      .order("rank", { ascending: true })
      .order("joined_at", { ascending: true })
      .limit(PRIZES_USDC.length);
    if (error) throw error;

    const winners = (data ?? []).map((row, index) => ({
      position: index + 1,
      wallet_address: row.wallet_address as string,
      username: (row.username as string | null) ?? null,
      total_points: Number(row.total_points),
      rank: Number(row.rank),
      prize_usdc: PRIZES_USDC[index],
    }));

    if (format === "csv") {
      const lines = [
        CSV_COLUMNS.join(","),
        ...winners.map((w) =>
          CSV_COLUMNS.map((col) => csvEscape(w[col])).join(","),
        ),
      ];
      return new NextResponse(lines.join("\r\n") + "\r\n", {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="fantasy-winners.csv"',
        },
      });
    }

    return jsonOk({
      winners,
      total_prize_usdc: winners.reduce((sum, w) => sum + w.prize_usdc, 0),
      prize_currency: "USDC",
      payout_network: "Base",
    });
  } catch (error) {
    console.error("[play admin] winners export failed:", error);
    return jsonError("Failed to export winners", 500);
  }
});
