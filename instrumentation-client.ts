import * as Sentry from "@sentry/nextjs";
import config from './app/lib/config';

Sentry.init({
  dsn: config.glitchtipDsn,
  environment: config.glitchtipEnvironment,
  release: config.glitchtipRelease,

  integrations: [
    Sentry.replayIntegration(),
  ],

  tracesSampleRate: config.glitchtipEnvironment === 'production' ? 0.1 : 1.0,

  enableLogs: true,
  replaysSessionSampleRate: 0.1,

  replaysOnErrorSampleRate: 1.0,

  sendDefaultPii: false,

  beforeSend(event) {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("privy:session");
        let sessionId = "anonymous";

        if (raw) {
          try {
            const parts = raw.split(".");
            const payloadPart = parts[1];

            if (payloadPart) {
              const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
              const padded = base64.padEnd(
                base64.length + ((4 - (base64.length % 4)) % 4),
                "=",
              );
              const payload = JSON.parse(atob(padded));
              sessionId = payload?.sub ?? payload?.sessionId ?? sessionId;
            }
          } catch {
            console.warn("Failed to parse Privy session for GlitchTip");
            sessionId = "anonymous";
          }
        }

        event.user = { ...(event.user ?? {}), id: sessionId };
        event.extra = { ...(event.extra ?? {}), timestamp: Date.now() };
      } catch (storageErr) {
        console.warn('GlitchTip beforeSend storage error:', storageErr);
      }
    }
    return event;
  },
});

// Defensive export: Fallback if API missing (e.g., SDK version mismatch)
export const onRouterTransitionStart =
  (Sentry as any).captureRouterTransitionStart ??
  (() => {
  });