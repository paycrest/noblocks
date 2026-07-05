/**
 * Noblocks Play — fantasy scheduler (Cloudflare Worker).
 *
 * Cron-triggered alarm clock only: every tick it POSTs the Next.js app's
 * `/api/play/worker` endpoint, which holds all sync/scoring/notification
 * logic (stakeholder decision, handoff §2.1). Failures are logged, never
 * thrown — a retry storm against the app would be worse than a missed tick
 * (the next one is at most a minute away).
 */

export interface Env {
  /** Base URL of the Next.js app (wrangler.toml [vars]). */
  APP_URL: string;
  /** Shared secret checked by /api/play/worker (wrangler secret). */
  FANTASY_WORKER_SECRET: string;
}

const BODY_SNIPPET_LENGTH = 500;

export default {
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const url = `${env.APP_URL.replace(/\/$/, "")}/api/play/worker`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "x-internal-auth": env.FANTASY_WORKER_SECRET,
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const body = await res.text();
      const snippet =
        body.length > BODY_SNIPPET_LENGTH ? `${body.slice(0, BODY_SNIPPET_LENGTH)}…` : body;

      if (res.ok) {
        console.log(
          `[fantasy-scheduler] tick ${new Date(controller.scheduledTime).toISOString()} → ${res.status}: ${snippet}`,
        );
      } else {
        // Log loudly but do NOT throw: throwing marks the invocation failed
        // and invites platform retries against an already-unhappy endpoint.
        console.error(`[fantasy-scheduler] worker endpoint returned ${res.status}: ${snippet}`);
      }
    } catch (error) {
      console.error(`[fantasy-scheduler] tick failed to reach ${url}:`, error);
    }
  },
};
