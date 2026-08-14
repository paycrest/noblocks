/**
 * Structured JSON logger with Datadog trace correlation.
 *
 * Mirrors the aggregator's logrus setup: every line is JSON on stdout, carrying
 * dd.trace_id / dd.span_id so Datadog can link a log to the trace that produced
 * it. The agent sidecar collects stdout; nothing is shipped over HTTP from here.
 *
 * Why this exists rather than `console`: next.config.mjs strips `console.log`
 * from production builds, and until recently stripped `warn`/`error`/`info`
 * too. Logging through pino is immune to that transform and produces parseable
 * JSON instead of interpolated strings.
 *
 * Server-only. Importing this from a client component pulls Node internals into
 * the browser bundle.
 */
import tracer from "dd-trace";
import pino from "pino";

/**
 * Datadog reserves `status` for log level, and expects `error.stack` /
 * `error.message` / `error.kind` for its error tracking.
 */
const DD_LEVEL_KEY = "status";

function traceContext(): Record<string, string> {
  // dd-trace exports an uninitialised singleton that is safe to touch before
  // instrumentation.ts calls init() — there is simply no active span yet.
  try {
    const span = tracer.scope().active();
    if (!span) return {};
    const context = span.context();
    return {
      "dd.trace_id": context.toTraceId(),
      "dd.span_id": context.toSpanId(),
    };
  } catch {
    // APM disabled or unavailable — plain structured logs still work.
    return {};
  }
}

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  // Datadog parses `status`, not pino's default `level`.
  formatters: {
    level: (label) => ({ [DD_LEVEL_KEY]: label }),
    // Stamped on every line so logs are filterable even when a trace is absent
    // (cron ticks, boot-time work).
    bindings: () => ({
      "dd.service": process.env.DD_SERVICE || "noblocks",
      "dd.env": process.env.DD_ENV || process.env.NODE_ENV || "development",
      "dd.version": process.env.DD_VERSION || "",
    }),
  },
  mixin: traceContext,
  // Datadog expects millisecond epoch under `timestamp`.
  timestamp: () => `,"timestamp":${Date.now()}`,
  redact: {
    // Both the bare and the wildcard form of each key are needed. fast-redact
    // treats "*.token" as "iterate the root object's children and redact
    // `token` inside each" — it does NOT match a root-level { token: ... },
    // which is the shape most call sites actually use. It has no recursive
    // wildcard, so each depth must be listed explicitly.
    paths: [
      "authorization",
      "cookie",
      "password",
      "token",
      "secret",
      "apiKey",
      "api_key",
      "*.authorization",
      "*.cookie",
      "*.password",
      "*.token",
      "*.secret",
      "*.apiKey",
      "*.api_key",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    censor: "[redacted]",
  },
});

export default logger;
