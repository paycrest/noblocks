import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";
import { requireAdmin } from "@/app/lib/fantasy/admin";
import { jsonError, jsonOk } from "@/app/lib/fantasy/server";

/**
 * Prize table (PRD): 300 USDC total, paid on Base — positions 1–5 get 40 USDC
 * each, positions 6–10 get 20 USDC each, assigned over the QUALIFIED-only
 * ordering (non-qualified/opted-out/disqualified rows are skipped entirely,
 * per §6 "prize ranking skips non-qualified").
 */
const PRIZES_USDC = [40, 40, 40, 40, 40, 20, 20, 20, 20, 20];

const CSV_COLUMNS = [
  "position",
  "wallet_address",
  "username",
  "total_points",
  "rank",
  "activated_referrals",
  "prize_usdc",
] as const;

const csvEscape = (value: unknown): string => {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * GET /api/play/admin/winners?format=json|csv — winners export for payout
 * (F-15). Reads fantasy_leaderboard ordered by global rank, keeps only
 * badge === 'qualified' rows (the view's rank column stays the GLOBAL rank;
 * `position` is the prize position over the qualified-only ordering).
 */
export const GET = withRateLimit(async (request: NextRequest) => {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const format =
      request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "json";

    const { data, error } = await supabaseAdmin
      .from("fantasy_leaderboard")
      .select(
        "wallet_address, username, total_points, rank, activated_referrals, badge",
      )
      .eq("badge", "qualified")
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
      activated_referrals: Number(row.activated_referrals ?? 0),
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
