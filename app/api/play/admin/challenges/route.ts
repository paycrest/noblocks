import { NextRequest, NextResponse } from "next/server";
import { withRateLimitAndAnalytics } from "@/app/lib/analytics-middleware";
import { csvEscape, requireAdmin } from "@/app/lib/fantasy/admin";
import { supabaseAdmin } from "@/app/lib/supabase";
import { MAX_MONTHLY_CHALLENGE_PRIZE_USDC, createChallenge, listChallenges, resolveChallenge } from "@/app/lib/fantasy/challenges";
import { jsonError, jsonOk } from "@/app/lib/fantasy/server";

/**
 * GET /api/play/admin/challenges — list season challenges.
 * GET ?id=&format=csv — export a resolved challenge winner for manual USDC.
 * POST — create { gameweekId, title, prizeUsdc, minLeagueSize? }.
 * POST ?resolve=1 — resolve { challengeId } (also runs from worker on GW final).
 */
export const GET = withRateLimitAndAnalytics(async (request: NextRequest) => {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const id = request.nextUrl.searchParams.get("id");
    const format = request.nextUrl.searchParams.get("format");

    if (id && format === "csv") {
      const { data: challenge, error } = await supabaseAdmin
        .from("fantasy_challenges")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!challenge) return jsonError("Challenge not found", 404);
      if (challenge.status !== "resolved") {
        return jsonError("Challenge is not resolved yet", 409, { code: "NOT_RESOLVED" });
      }
      const meta = (challenge.meta ?? {}) as {
        winner_points?: number;
        winner_league_id?: string;
      };
      const { data: profile } = challenge.winner_wallet
        ? await supabaseAdmin
            .from("user_kyc_profiles")
            .select("username")
            .eq("wallet_address", challenge.winner_wallet)
            .maybeSingle()
        : { data: null };

      const lines = [
        "challenge_id,title,gameweek_id,prize_usdc,wallet_address,username,points,league_id,status",
        [
          challenge.id,
          challenge.title,
          challenge.gameweek_id,
          challenge.prize_usdc,
          challenge.winner_wallet ?? "",
          profile?.username ?? "",
          meta.winner_points ?? "",
          meta.winner_league_id ?? "",
          challenge.status,
        ]
          .map(csvEscape)
          .join(","),
      ];
      return new NextResponse(lines.join("\r\n") + "\r\n", {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="challenge-${id}.csv"`,
        },
      });
    }

    const challenges = await listChallenges(50);
    return jsonOk({ challenges });
  } catch (error) {
    console.error("[play admin] challenges list failed:", error);
    return jsonError("Failed to list challenges", 500);
  }
});

export const POST = withRateLimitAndAnalytics(async (request: NextRequest) => {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const resolve = request.nextUrl.searchParams.get("resolve") === "1";
    const body = await request.json().catch(() => null);

    if (resolve) {
      const challengeId = typeof body?.challengeId === "string" ? body.challengeId : "";
      if (!challengeId) return jsonError("Provide challengeId", 400);
      try {
        const result = await resolveChallenge(challengeId);
        return jsonOk(result);
      } catch (e) {
        if (e instanceof Error) {
          if (e.message === "NOT_FOUND") return jsonError("Challenge not found", 404);
          if (e.message === "GW_NOT_FINAL") {
            return jsonError("Gameweek is not final yet", 409, { code: "GW_NOT_FINAL" });
          }
        }
        throw e;
      }
    }

    const gameweekId = Number(body?.gameweekId);
    const title = typeof body?.title === "string" ? body.title : "";
    const prizeUsdc = Number(body?.prizeUsdc);
    const minLeagueSize =
      body?.minLeagueSize != null ? Number(body.minLeagueSize) : undefined;

    if (!Number.isFinite(gameweekId)) return jsonError("Provide gameweekId", 400);
    if (!Number.isFinite(prizeUsdc) || prizeUsdc < 0) {
      return jsonError("Provide prizeUsdc ≥ 0", 400);
    }

    try {
      const challenge = await createChallenge({
        gameweekId,
        title,
        prizeUsdc,
        minLeagueSize,
      });
      return jsonOk({ challenge }, { status: 201 });
    } catch (e) {
      if (e instanceof Error) {
        if (e.message === "TITLE_TOO_SHORT") {
          return jsonError("Title must be at least 3 characters", 400);
        }
        if (e.message === "OUT_OF_SEASON") {
          return jsonError("Gameweek id is outside the current season", 400, {
            code: "OUT_OF_SEASON",
          });
        }
        if (e.message === "PRIZE_TOO_HIGH") {
          return jsonError(`prizeUsdc must be ≤ ${MAX_MONTHLY_CHALLENGE_PRIZE_USDC}`, 400, {
            code: "PRIZE_TOO_HIGH",
          });
        }
        if (e.message === "PRIZE_BUDGET_EXCEEDED") {
          return jsonError(
            `Rolling 30-day challenge budget is ${MAX_MONTHLY_CHALLENGE_PRIZE_USDC} USDC — reduce prizeUsdc or wait for older challenges to roll off`,
            400,
            { code: "PRIZE_BUDGET_EXCEEDED" },
          );
        }
        if (e.message === "INVALID_PRIZE") {
          return jsonError("Provide prizeUsdc ≥ 0", 400);
        }
        if (e.message === "INVALID_MIN_LEAGUE_SIZE") {
          return jsonError("minLeagueSize must be an integer between 2 and 100", 400, {
            code: "INVALID_MIN_LEAGUE_SIZE",
          });
        }
        if (e.message === "DUPLICATE_GAMEWEEK") {
          return jsonError("A challenge already exists for this gameweek", 409, {
            code: "DUPLICATE_GAMEWEEK",
          });
        }
      }
      throw e;
    }
  } catch (error) {
    console.error("[play admin] challenge write failed:", error);
    return jsonError("Failed to update challenge", 500);
  }
});
