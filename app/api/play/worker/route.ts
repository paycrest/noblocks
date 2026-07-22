import { timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";
import { runWorkerTick } from "@/app/lib/fantasy/worker";
import { jsonError, jsonOk } from "@/app/lib/fantasy/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/play/worker — one scoring-worker tick, fired every minute (twice
 * a minute while a game is live) by a Cloudflare Worker cron trigger managed
 * directly in the Cloudflare dashboard (not part of this repo) — it POSTs
 * this endpoint for both the staging and production domains. Self-
 * authenticated via x-internal-auth (FANTASY_WORKER_SECRET, falling back to
 * INTERNAL_API_KEY),
 * so it is excluded from the middleware's JWT-authorization matcher and keeps
 * running even while NEXT_PUBLIC_FANTASY_ENABLED hides the UI pre-launch.
 *
 * Body (optional): { "force": true } bypasses the minute-of-hour gating on
 * fixture refresh and the referral sweep — for manual ops/debugging.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.FANTASY_WORKER_SECRET || process.env.INTERNAL_API_KEY;
  const provided = request.headers.get("x-internal-auth");
  if (!secret || !provided) {
    return jsonError("Unauthorized", 401);
  }
  const secretBuf = Buffer.from(secret);
  const providedBuf = Buffer.from(provided);
  if (providedBuf.length !== secretBuf.length || !timingSafeEqual(providedBuf, secretBuf)) {
    return jsonError("Unauthorized", 401);
  }

  try {
    const body = (await request.json().catch(() => null)) as { force?: boolean } | null;
    const report = await runWorkerTick({ force: body?.force === true });
    if (report.alerts.length > 0) {
      console.warn("[play worker] alerts:", report.alerts);
    }
    return jsonOk(report);
  } catch (error) {
    console.error("[play worker] tick failed:", error);
    return jsonError("Worker tick failed", 500);
  }
}
