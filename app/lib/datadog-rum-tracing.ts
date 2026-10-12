/**
 * Pure helpers for Datadog RUM distributed tracing configuration (testable without
 * loading the browser SDK).
 */

export type RumTracingUrlMatcher =
  | string
  | RegExp
  | ((url: string) => boolean)
  | {
      match: string | RegExp | ((url: string) => boolean);
      propagatorTypes: Array<"tracecontext" | "datadog" | "b3" | "b3multi">;
    };

const AGGREGATOR_ORIGIN_RE = /\/v1\/?$/i;

function parseOrigin(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const normalized = trimmed.replace(AGGREGATOR_ORIGIN_RE, "");
    return new URL(normalized).origin;
  } catch {
    return null;
  }
}

/**
 * Same-origin `/api` BFF routes plus aggregator host(s) from env. Extra origins
 * may be listed in `NEXT_PUBLIC_DD_TRACING_ALLOWED_ORIGINS` (comma-separated).
 */
export function buildAllowedTracingUrls(
  env: {
    aggregatorUrl?: string;
    extraOrigins?: string;
    appOrigin?: string;
  } = {},
): RumTracingUrlMatcher[] {
  const matchers: RumTracingUrlMatcher[] = [];

  const appOrigin = env.appOrigin?.trim();
  if (appOrigin) {
    matchers.push((url: string) => {
      try {
        const parsed = new URL(url, appOrigin);
        return (
          parsed.origin === appOrigin && parsed.pathname.startsWith("/api")
        );
      } catch {
        return false;
      }
    });
  } else {
    matchers.push((url: string) => {
      if (typeof window === "undefined") return false;
      try {
        const parsed = new URL(url, window.location.origin);
        return (
          parsed.origin === window.location.origin &&
          parsed.pathname.startsWith("/api")
        );
      } catch {
        return false;
      }
    });
  }

  const propagatorTypes: Array<"tracecontext" | "datadog"> = [
    "tracecontext",
    "datadog",
  ];

  const aggregatorOrigin = parseOrigin(env.aggregatorUrl ?? "");
  if (aggregatorOrigin) {
    matchers.push({ match: aggregatorOrigin, propagatorTypes });
  }

  const extra = (env.extraOrigins ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const origin of extra) {
    const parsed = parseOrigin(origin) ?? origin;
    if (!parsed) continue;
    matchers.push({ match: parsed, propagatorTypes });
  }

  return matchers;
}
