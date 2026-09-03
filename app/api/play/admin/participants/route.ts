import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimitAndAnalytics } from "@/app/lib/analytics-middleware";
import { requireAdmin } from "@/app/lib/fantasy/admin";
import { jsonError, jsonOk } from "@/app/lib/fantasy/server";

const PAGE_SIZE = 50;

/**
 * GET /api/play/admin/participants?search=&page= — full participant list for
 * the admin console. Reads fantasy_leaderboard and merges moderation flags.
 */
export const GET = withRateLimitAndAnalytics(async (request: NextRequest) => {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const params = request.nextUrl.searchParams;
    const page = Math.max(1, Number(params.get("page")) || 1);
    const rawSearch = (params.get("search") ?? "").trim();

    let query = supabaseAdmin
      .from("fantasy_leaderboard")
      .select(
        "wallet_address, username, total_points, rank, previous_rank, badge, disqualified, giveaway_opt_in, joined_at",
        { count: "exact" },
      )
      .order("rank", { ascending: true })
      .order("joined_at", { ascending: true });

    if (rawSearch) {
      const term = rawSearch.replace(/[^A-Za-z0-9_]/g, "").replace(/_/g, "\\_");
      if (term) {
        query = query.or(
          `username.ilike.%${term}%,wallet_address.ilike.%${term}%`,
        );
      }
    }

    const from = (page - 1) * PAGE_SIZE;
    const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const rows = data ?? [];
    const flagsByWallet = new Map<string, unknown[]>();
    if (rows.length > 0) {
      const { data: flagRows, error: flagsError } = await supabaseAdmin
        .from("fantasy_participants")
        .select("wallet_address, flags")
        .in(
          "wallet_address",
          rows.map((r) => r.wallet_address as string),
        );
      if (flagsError) throw flagsError;
      for (const row of flagRows ?? []) {
        flagsByWallet.set(
          row.wallet_address as string,
          Array.isArray(row.flags) ? (row.flags as unknown[]) : [],
        );
      }
    }

    const participants = rows.map((row) => ({
      wallet_address: row.wallet_address as string,
      username: (row.username as string | null) ?? null,
      total_points: Number(row.total_points),
      rank: Number(row.rank),
      previous_rank: row.previous_rank != null ? Number(row.previous_rank) : null,
      badge: row.badge as string,
      disqualified: Boolean(row.disqualified),
      giveaway_opt_in: Boolean(row.giveaway_opt_in),
      joined_at: row.joined_at as string,
      flags: flagsByWallet.get(row.wallet_address as string) ?? [],
    }));

    return jsonOk({ participants, page, total: count ?? participants.length });
  } catch (error) {
    console.error("[play admin] participants list failed:", error);
    return jsonError("Failed to list participants", 500);
  }
});
