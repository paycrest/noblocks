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

  sendDefaultPii: true,

  // Add custom context (e.g., user session from Privy)
  beforeSend(event) {
    if (typeof window !== 'undefined') {
      const sessionId = localStorage.getItem('privy:session') || 'anonymous';
      event.user = { id: sessionId };
      event.extra = { ...event.extra, timestamp: Date.now() };
    }
    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;