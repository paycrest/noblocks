/**
 * Noblocks Play — fantasy scheduler (Cloudflare Worker).
 *
 * Cron-triggered alarm clock only: it POSTs the Next.js app's
 * `/api/play/worker` endpoint, which holds all sync/scoring/notification
 * logic (stakeholder decision, handoff §2.1). Failures are logged, never
 * thrown — a retry storm against the app would be worse than a missed tick.
 *
 * Cron Triggers can't schedule sub-minute intervals, so the base cron stays
 * at once a minute; while the app reports a live game in progress it fires a
 * second tick ~30s later, halving the interval only when it's worth the
 * extra invocation. Outside a live window, ticking twice as often would just
 * double the always-on DB reads for nothing (TRD §2.4 provider frugality).
 */

export interface Env {
  /** Base URL of the Next.js app (wrangler.toml [vars]). */
  APP_URL: string;
  /** Shared secret checked by /api/play/worker (wrangler secret). */
  FANTASY_WORKER_SECRET: string;
}

const BODY_SNIPPET_LENGTH = 500;
const FETCH_TIMEOUT_MS = 10_000;
const LIVE_TICK_DELAY_MS = 30_000;

async function tick(env: Env, label: string): Promise<{ live: boolean }> {
  const url = `${env.APP_URL.replace(/\/$/, "")}/api/play/worker`;

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "x-internal-auth": env.FANTASY_WORKER_SECRET,
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
      signal: abortController.signal,
    });
    clearTimeout(timeoutId);

    const body = await res.text();
    const snippet =
      body.length > BODY_SNIPPET_LENGTH ? `${body.slice(0, BODY_SNIPPET_LENGTH)}…` : body;

    if (!res.ok) {
      // Log loudly but do NOT throw: throwing marks the invocation failed
      // and invites platform retries against an already-unhappy endpoint.
      console.error(`[fantasy-scheduler] ${label} worker endpoint returned ${res.status}: ${snippet}`);
      return { live: false };
    }

    console.log(`[fantasy-scheduler] ${label} → ${res.status}: ${snippet}`);
    try {
      const parsed = JSON.parse(body) as { data?: { live_window_active?: boolean } };
      return { live: parsed.data?.live_window_active === true };
    } catch {
      return { live: false };
    }
  } catch (error) {
    clearTimeout(timeoutId);
    console.error(`[fantasy-scheduler] ${label} failed to reach ${url}:`, error);
    return { live: false };
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default {
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const scheduledAt = new Date(controller.scheduledTime).toISOString();

    const first = await tick(env, `tick ${scheduledAt}`);
    if (first.live) {
      await sleep(LIVE_TICK_DELAY_MS);
      await tick(env, `tick ${scheduledAt} +30s`);
    }
  },
};
