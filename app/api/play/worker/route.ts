import { createHash, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";
import { withAnalytics } from "@/app/lib/analytics-middleware";
import {
  buildWorkerFailureLog,
  buildWorkerTickLog,
  emitWorkerTickLog,
} from "@/app/lib/fantasy/telemetry";
import { runWorkerTick } from "@/app/lib/fantasy/worker";
import { jsonError, jsonOk } from "@/app/lib/fantasy/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const sha256 = (value: string) => createHash("sha256").update(value).digest();

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
export const POST = withAnalytics(async (request: NextRequest) => {
  const secret = process.env.FANTASY_WORKER_SECRET || process.env.INTERNAL_API_KEY;
  const provided = request.headers.get("x-internal-auth");
  if (!secret || !provided) {
    return jsonError("Unauthorized", 401);
  }
  if (!timingSafeEqual(sha256(provided), sha256(secret))) {
    return jsonError("Unauthorized", 401);
  }

  // Hoisted so the failure log can report them too.
  const startedAt = Date.now();
  let forced = false;

  try {
    const body = (await request.json().catch(() => null)) as { force?: boolean } | null;
    forced = body?.force === true;
    const report = await runWorkerTick({ force: forced });
    // The alert detail rides on the structured line below (@worker.alerts), so
    // there is no separate console.warn to keep in step with it.
    emitWorkerTickLog(
      buildWorkerTickLog(report, Date.now() - startedAt, { forced }),
    );
    return jsonOk(report);
  } catch (error) {
    emitWorkerTickLog(
      buildWorkerFailureLog(error, Date.now() - startedAt, { forced }),
    );
    return jsonError("Worker tick failed", 500);
  }
});
