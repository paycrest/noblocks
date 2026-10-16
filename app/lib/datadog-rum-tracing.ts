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

const PROPAGATOR_TYPES: Array<"tracecontext" | "datadog"> = [
  "tracecontext",
  "datadog",
];

/**
 * Same-origin Noblocks BFF prefix: `/api` or `/api/...` (not `/apiary` or `/apis`).
 */
export function isNoblocksApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/**
 * Normalizes an aggregator base URL or origin string to a URL `origin` for matching.
 */
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

/** Compares request URL origin exactly (avoids Datadog string-prefix host collisions). */
function urlMatchesOrigin(url: string, allowedOrigin: string): boolean {
  try {
    return new URL(url).origin === allowedOrigin;
  } catch {
    return false;
  }
}

function exactOriginMatcher(allowedOrigin: string): RumTracingUrlMatcher {
  return {
    match: (url: string) => urlMatchesOrigin(url, allowedOrigin),
    propagatorTypes: PROPAGATOR_TYPES,
  };
}

function sameOriginApiMatcher(appOrigin: string): (url: string) => boolean {
  return (url: string) => {
    try {
      const parsed = new URL(url, appOrigin);
      return (
        parsed.origin === appOrigin && isNoblocksApiPath(parsed.pathname)
      );
    } catch {
      return false;
    }
  };
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
    matchers.push(sameOriginApiMatcher(appOrigin));
  } else {
    matchers.push((url: string) => {
      if (typeof window === "undefined") return false;
      return sameOriginApiMatcher(window.location.origin)(url);
    });
  }

  const aggregatorOrigin = parseOrigin(env.aggregatorUrl ?? "");
  if (aggregatorOrigin) {
    matchers.push(exactOriginMatcher(aggregatorOrigin));
  }

  const extra = (env.extraOrigins ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const entry of extra) {
    const parsed = parseOrigin(entry);
    if (!parsed) continue;
    matchers.push(exactOriginMatcher(parsed));
  }

  return matchers;
}
