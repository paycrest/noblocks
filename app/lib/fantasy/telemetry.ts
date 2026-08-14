/**
 * Datadog telemetry for the fantasy scoring worker.
 *
 * The worker is driven by an external Cloudflare cron, so nothing in RUM or in
 * the Mixpanel API-analytics path observes it. Its WorkerReport already carries
 * everything an on-call engineer needs — how much work the tick did, how much
 * API-Football budget is left, and what went wrong — but until now it was only
 * returned to the caller and dropped.
 *
 * One log line per tick, flattened into `@worker.*` facets so Datadog can turn
 * them into metrics (Logs → Generate Metrics) and monitors.
 *
 * Emitted through the shared pino logger to stdout, where the agent sidecar
 * collects it. The tick also runs inside an APM span, so `logger` stamps
 * dd.trace_id and the line links back to its trace.
 */
import logger from "@/app/lib/logger";

import type { WorkerReport } from "./types";

type DatadogLogStatus = "info" | "warn" | "error";

/** Stable message strings — log-based metrics and monitors filter on these. */
export const WORKER_TICK_MESSAGE = "play worker tick";
export const WORKER_FAILURE_MESSAGE = "play worker tick failed";

/** Keeps a pathological alert loop from shipping a multi-MB log line. */
const MAX_LIST_ENTRIES = 25;
const MAX_ENTRY_LENGTH = 300;

/**
 * Bounds on the failure payload. Provider and Postgres errors can carry long
 * messages built from the data that caused them, so an unbounded message is
 * both a payload-size and an accidental-disclosure risk.
 *
 * The stack is capped rather than dropped: these frames are our own code paths
 * and are the main reason to ship an error log at all. A few frames is enough
 * to locate the throw.
 */
const MAX_ERROR_MESSAGE_LENGTH = 500;
const MAX_ERROR_STACK_LENGTH = 2_000;

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export interface WorkerTickLog {
  message: string;
  status: DatadogLogStatus;
  attributes: Record<string, unknown>;
}

function truncateList(values: string[]): string[] {
  return values
    .slice(0, MAX_LIST_ENTRIES)
    .map((value) => truncate(value, MAX_ENTRY_LENGTH));
}

/**
 * Flattens a completed tick. Status is `warn` whenever the report carries
 * alerts — that is the signal worth paging on, since a tick can "succeed"
 * (HTTP 200) while rollover or score recompute silently failed inside it.
 */
export function buildWorkerTickLog(
  report: WorkerReport,
  durationMs: number,
  options?: { forced?: boolean },
): WorkerTickLog {
  const notificationsSkipped = report.notifications === "skipped";

  return {
    message: WORKER_TICK_MESSAGE,
    status: report.alerts.length > 0 ? "warn" : "info",
    attributes: {
      feature: "play",
      worker: {
        ok: true,
        ran_at: report.ran_at,
        duration_ms: durationMs,
        forced: options?.forced === true,
        live_window_active: report.live_window_active,
        fixtures_refreshed: report.fixtures_refreshed,
        kickoff_stamps: report.kickoff_stamps,
        stats_synced: report.stats_synced,
        fixtures_finalized: report.fixtures_finalized,
        scores_recomputed: report.scores_recomputed,
        rolled_over_to: report.rolled_over_to,
        // Boolean twin so a rollover is countable without a null-vs-0 filter.
        did_rollover: report.rolled_over_to !== null,
        notifications_skipped: notificationsSkipped,
        notifications_sent: notificationsSkipped
          ? 0
          : (report.notifications as { sent: number }).sent,
        provider_remaining: report.provider_rate_limit.remaining,
        provider_limit: report.provider_rate_limit.limit,
        transitions_count: report.transitions.length,
        transitions: truncateList(report.transitions),
        alerts_count: report.alerts.length,
        alerts: truncateList(report.alerts),
      },
    },
  };
}

/**
 * Flattens a tick that threw. Deliberately shares the `@worker.*` namespace and
 * sets `ok:false`, so a single "ticks in the last 10 minutes" heartbeat query
 * counts crashed ticks too — a crash loop must not read as a healthy worker.
 */
export function buildWorkerFailureLog(
  error: unknown,
  durationMs: number,
  options?: { forced?: boolean },
): WorkerTickLog {
  const normalized = error instanceof Error ? error : new Error(String(error));

  return {
    message: WORKER_FAILURE_MESSAGE,
    status: "error",
    attributes: {
      feature: "play",
      worker: {
        ok: false,
        ran_at: new Date().toISOString(),
        duration_ms: durationMs,
        forced: options?.forced === true,
        alerts_count: 1,
      },
      error: {
        kind: normalized.name,
        message: truncate(normalized.message, MAX_ERROR_MESSAGE_LENGTH),
        stack: normalized.stack
          ? truncate(normalized.stack, MAX_ERROR_STACK_LENGTH)
          : undefined,
      },
    },
  };
}

/**
 * Writes a built log line to stdout for the agent to collect.
 *
 * Synchronous and non-throwing by contract: pino writes to a stream rather than
 * making a network call, so unlike the previous HTTP shipper there is nothing
 * to await and no in-flight request for the runtime to drop.
 */
export function emitWorkerTickLog(log: WorkerTickLog): void {
  logger[log.status](log.attributes, log.message);
}
