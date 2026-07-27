"use client";

import { datadogRum } from "@datadog/browser-rum";
import Cookies from "js-cookie";

const INIT_KEY = "__noblocks_datadog_rum_init__" as const;

const SENSITIVE_KEYS = [
  "authorization",
  "cookie",
  "password",
  "otp",
  "otpcode",
  "phonenumber",
  "phone",
  "email",
  "token",
  "secret",
  "wallet",
  "address",
];

export function hasAnalyticsCookieConsent(): boolean {
  const consent = Cookies.get("cookieConsent");
  if (!consent) return false;

  try {
    return !!JSON.parse(consent).analytics;
  } catch {
    return false;
  }
}

function scrubContext(
  context: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!context) return context;

  const scrubbed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (SENSITIVE_KEYS.some((s) => key.toLowerCase().includes(s))) {
      scrubbed[key] = "[redacted]";
      continue;
    }
    if (typeof value === "string" && value.length > 500) {
      scrubbed[key] = `${value.slice(0, 80)}…[truncated]`;
      continue;
    }
    scrubbed[key] = value;
  }
  return scrubbed;
}

/**
 * Initializes browser Datadog RUM (EU site by default). Consent-gated and
 * disabled in development unless NEXT_PUBLIC_DD_ENABLE_IN_DEV=true.
 * Safe to call multiple times; runs once per tab after consent.
 */
export function initDatadogRum(): boolean {
  if (typeof window === "undefined") return false;

  const g = window as Window & { [INIT_KEY]?: boolean };
  if (g[INIT_KEY]) return true;

  if (!hasAnalyticsCookieConsent()) return false;

  const applicationId = process.env.NEXT_PUBLIC_DD_APPLICATION_ID?.trim();
  const clientToken = process.env.NEXT_PUBLIC_DD_CLIENT_TOKEN?.trim();
  if (!applicationId || !clientToken) return false;

  const enableInDev = process.env.NEXT_PUBLIC_DD_ENABLE_IN_DEV === "true";
  if (process.env.NODE_ENV === "development" && !enableInDev) return false;

  const sessionSampleRate = Number(
    process.env.NEXT_PUBLIC_DD_RUM_SAMPLE_RATE ?? "100",
  );
  const sessionReplaySampleRate = Number(
    process.env.NEXT_PUBLIC_DD_SESSION_REPLAY_SAMPLE_RATE ?? "0",
  );

  try {
    datadogRum.init({
      applicationId,
      clientToken,
      site: process.env.NEXT_PUBLIC_DD_SITE || "datadoghq.eu",
      service: process.env.NEXT_PUBLIC_DD_SERVICE || "noblocks",
      env:
        process.env.NEXT_PUBLIC_DD_ENV ||
        process.env.NODE_ENV ||
        "development",
      version: process.env.NEXT_PUBLIC_DD_VERSION,
      sessionSampleRate: Number.isFinite(sessionSampleRate)
        ? sessionSampleRate
        : 100,
      sessionReplaySampleRate: Number.isFinite(sessionReplaySampleRate)
        ? sessionReplaySampleRate
        : 0,
      trackUserInteractions: true,
      trackResources: true,
      trackLongTasks: true,
      trackViewsManually: true,
      defaultPrivacyLevel: "mask-user-input",
      trackingConsent: "granted",
      beforeSend(event) {
        if (event.type === "action" && event.action?.target?.name) {
          const name = event.action.target.name.toLowerCase();
          if (SENSITIVE_KEYS.some((s) => name.includes(s))) {
            return false;
          }
        }
        if (event.context) {
          event.context = scrubContext(
            event.context as Record<string, unknown>,
          ) as typeof event.context;
        }
        return true;
      },
    });
  } catch {
    // Leave INIT_KEY unset so a later consent event can retry.
    return false;
  }

  g[INIT_KEY] = true;
  return true;
}

export function isDatadogRumInitialized(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as Window & { [INIT_KEY]?: boolean })[INIT_KEY];
}

/**
 * Applies the current analytics cookie consent to Datadog RUM.
 * Initializes on grant; sets trackingConsent to not-granted on revoke.
 * Returns true when RUM is initialized and tracking is granted.
 */
export function syncDatadogRumConsent(): boolean {
  if (typeof window === "undefined") return false;

  const consented = hasAnalyticsCookieConsent();

  if (isDatadogRumInitialized()) {
    datadogRum.setTrackingConsent(consented ? "granted" : "not-granted");
    return consented;
  }

  if (!consented) return false;
  return initDatadogRum();
}

/** Record a SPA view after client-side navigation. */
export function trackDatadogView(pathname: string): void {
  if (!isDatadogRumInitialized() || !hasAnalyticsCookieConsent()) return;
  datadogRum.startView({ name: pathname });
}

export { datadogRum };
