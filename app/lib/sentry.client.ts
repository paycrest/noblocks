"use client";

import * as Sentry from "@sentry/react";

const INIT_KEY = "__noblocks_sentry_init__" as const;

function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  const sensitive = [
    "authorization",
    "cookie",
    "password",
    "otp",
    "otpCode",
    "phoneNumber",
    "phone",
    "email",
    "token",
    "secret",
  ];

  const scrubValue = (value: unknown): unknown => {
    if (value == null) return value;
    if (typeof value === "string") {
      if (value.length > 500) return `${value.slice(0, 80)}…[truncated]`;
      return value;
    }
    return value;
  };

  if (event.request?.headers) {
    const h = { ...event.request.headers };
    for (const key of Object.keys(h)) {
      if (sensitive.some((s) => key.toLowerCase().includes(s))) {
        h[key] = "[redacted]";
      }
    }
    event.request.headers = h;
  }

  if (event.extra && typeof event.extra === "object") {
    const extra = { ...event.extra } as Record<string, unknown>;
    for (const key of Object.keys(extra)) {
      if (sensitive.some((s) => key.toLowerCase().includes(s))) {
        extra[key] = "[redacted]";
      } else {
        extra[key] = scrubValue(extra[key]);
      }
    }
    event.extra = extra;
  }

  // Strip query string from request URL (tokens / PII often live there)
  if (event.request?.url && typeof event.request.url === "string") {
    const url = event.request.url;
    const q = url.indexOf("?");
    event.request.url = q >= 0 ? url.slice(0, q) : url;
  }

  return event;
}

/**
 * Initializes browser-only Sentry (works with GlitchTip: set NEXT_PUBLIC_SENTRY_DSN to the project DSN).
 * Safe to call multiple times; runs once per tab.
 */
export function ensureSentryClientInitialized(): void {
  if (typeof window === "undefined") return;

  const g = window as Window & { [INIT_KEY]?: boolean };
  if (g[INIT_KEY]) return;

  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
  if (!dsn) return;

  const enableInDev =
    process.env.NEXT_PUBLIC_SENTRY_ENABLE_IN_DEV === "true";

  if (process.env.NODE_ENV === "development" && !enableInDev) return;

  g[INIT_KEY] = true;

  Sentry.init({
    dsn,
    sendDefaultPii: false,
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
      process.env.NODE_ENV ||
      "development",
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    tracesSampleRate: Number(
      process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0",
    ),
    beforeSend(event) {
      return scrubEvent(event);
    },
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Non-Error promise rejection captured",
      /chrome-extension:\/\//i,
      /moz-extension:\/\//i,
    ],
  });
}

/**
 * Report a handled error to GlitchTip. The **primary event** is `error` itself
 * (original message, stack, etc.); `context` / `extra` is only supplemental
 * (e.g. `userFacingMessage` for the copy shown in the UI).
 */
export function reportClientError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  ensureSentryClientInitialized();
  Sentry.captureException(error, {
    extra: context,
  });
}

export { Sentry };
