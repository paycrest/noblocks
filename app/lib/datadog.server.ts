/**
 * Server-side Datadog log intake.
 *
 * Noblocks runs no server APM agent — the browser RUM SDK in datadog.client.ts
 * is the only other Datadog surface, and it can only see work a browser
 * initiates. Cron-driven server work (the fantasy scoring worker) is invisible
 * to it. This posts structured JSON straight to the HTTP logs intake so those
 * paths are graphable and alertable.
 *
 * Fire-and-forget by contract: every failure is swallowed and every call is
 * bounded by a short timeout. Telemetry must never break or stall its caller.
 *
 * Server-only: reads DD_API_KEY, which is deliberately *not* NEXT_PUBLIC_.
 */

const INTAKE_TIMEOUT_MS = 2_000;

export type DatadogLogStatus = "info" | "warn" | "error";

/** EU by default, matching the RUM client's `site` default. */
function getSite(): string {
  return process.env.NEXT_PUBLIC_DD_SITE?.trim() || "datadoghq.eu";
}

function getIntakeUrl(): string {
  return `https://http-intake.logs.${getSite()}/api/v2/logs`;
}

/**
 * Mirrors the RUM client's gate: needs credentials, and stays off in local dev
 * unless NEXT_PUBLIC_DD_ENABLE_IN_DEV=true.
 */
function isEnabled(): boolean {
  if (typeof window !== "undefined") return false;
  if (!process.env.DD_API_KEY?.trim()) return false;
  if (
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_DD_ENABLE_IN_DEV !== "true"
  ) {
    return false;
  }
  return true;
}

function getDdTags(): string {
  const tags = [
    `env:${process.env.NEXT_PUBLIC_DD_ENV || process.env.NODE_ENV || "development"}`,
  ];
  const version = process.env.NEXT_PUBLIC_DD_VERSION?.trim();
  if (version) tags.push(`version:${version}`);
  return tags.join(",");
}

/**
 * Ships one structured log line. Nested objects in `attributes` become dotted
 * Datadog facets (`{ worker: { alerts_count: 2 } }` → `@worker.alerts_count`).
 *
 * Returns whether the line was accepted by the intake — for tests and for
 * callers that want to know telemetry is live. Never throws.
 */
export async function logToDatadog(
  message: string,
  attributes: Record<string, unknown> = {},
  status: DatadogLogStatus = "info",
): Promise<boolean> {
  if (!isEnabled()) return false;

  // AbortController rather than AbortSignal.timeout: the latter is missing on
  // some runtimes (jsdom, older Node), and a silently unbounded intake call is
  // exactly the failure this guard exists to prevent.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INTAKE_TIMEOUT_MS);

  try {
    const response = await fetch(getIntakeUrl(), {
      method: "POST",
      headers: {
        "DD-API-KEY": process.env.DD_API_KEY!.trim(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        {
          ddsource: "nodejs",
          service: process.env.NEXT_PUBLIC_DD_SERVICE || "noblocks",
          ddtags: getDdTags(),
          hostname: "server",
          status,
          message,
          ...attributes,
        },
      ]),
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    // Intentionally silent — a telemetry outage must not surface as an app error.
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
