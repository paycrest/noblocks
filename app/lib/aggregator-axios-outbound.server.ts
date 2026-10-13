import "server-only";

import axios, { AxiosHeaders, type InternalAxiosRequestConfig } from "axios";

import { buildAggregatorOutboundHeaders } from "@/app/lib/aggregator-outbound-headers";

let registered = false;

function resolveRequestUrl(config: InternalAxiosRequestConfig): string {
  const raw = config.url ?? "";
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = config.baseURL ?? "";
  if (!base) return raw;
  try {
    return new URL(raw, base).href;
  } catch {
    return raw;
  }
}

/** Direct calls to the aggregator API (not same-origin /api BFF routes). */
export function isDirectAggregatorAxiosUrl(url: string): boolean {
  const aggregator = process.env.NEXT_PUBLIC_AGGREGATOR_URL?.trim();
  if (!aggregator || !url) return false;
  try {
    const origin = new URL(
      aggregator.replace(/\/v1\/?$/i, ""),
    ).origin;
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

/**
 * Adds X-Request-ID and trace propagation headers on server-side axios calls to
 * the aggregator. Registered from instrumentation.ts only (never from client
 * bundles).
 */
export function registerAggregatorAxiosOutboundTracing(): void {
  if (registered) return;
  registered = true;

  axios.interceptors.request.use(async (config) => {
    const url = resolveRequestUrl(config);
    if (!isDirectAggregatorAxiosUrl(url)) {
      return config;
    }

    const existing =
      config.headers && typeof config.headers === "object"
        ? Object.fromEntries(
            Object.entries(config.headers).map(([k, v]) => [
              k,
              typeof v === "string" ? v : String(v ?? ""),
            ]),
          )
        : {};

    const merged = await buildAggregatorOutboundHeaders(existing);
    const headers = AxiosHeaders.from(config.headers);
    for (const [key, value] of Object.entries(merged)) {
      headers.set(key, value);
    }
    config.headers = headers;
    return config;
  });
}
