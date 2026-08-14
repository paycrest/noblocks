/**
 * Datadog APM bootstrap.
 *
 * Next.js calls `register()` once, before any other server code runs — which is
 * what dd-trace needs, since it patches http/pg/undici at require time and
 * cannot instrument modules that were already loaded.
 *
 * The Node.js equivalent of the aggregator's utils/observability/tracer.go.
 *
 * `instrumentation.ts` is stable in Next.js 15 — no `experimental
 * .instrumentationHook` flag is needed, and setting one on this version does
 * nothing.
 */

export async function register() {
  // Skipped on the Edge runtime (middleware): dd-trace is a Node library and
  // importing it there breaks the Edge bundle.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DD_TRACE_ENABLED === "false") return;

  const { default: tracer } = await import("dd-trace");

  tracer.init({
    service: process.env.DD_SERVICE || "noblocks",
    env: process.env.DD_ENV || process.env.NODE_ENV || "development",
    version: process.env.DD_VERSION,
    // Reaches the agent sidecar over the Docker network. Defaults suit a local
    // agent; in deployment DD_AGENT_HOST names the agent container.
    hostname: process.env.DD_AGENT_HOST || "localhost",
    port: Number(process.env.DD_TRACE_AGENT_PORT || 8126),
    // Correlates logs to traces by injecting dd.trace_id / dd.span_id — the
    // same fields app/lib/logger.ts writes, and what makes the "View Trace"
    // link appear on a log line.
    logInjection: true,
    // Needs @datadog/native-metrics to have been built. package.json lists it
    // under pnpm.onlyBuiltDependencies so the install compiles it; without
    // that approval pnpm silently skips the build and this degrades to no
    // runtime metrics rather than failing.
    runtimeMetrics: true,
  });
}
