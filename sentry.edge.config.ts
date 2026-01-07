import * as Sentry from "@sentry/nextjs";
import config from './app/lib/config';

Sentry.init({
  dsn: config.sentryDsn,
  
  environment: config.nodeEnv,

  release: "2.0.0",

  tracesSampleRate: config.nodeEnv === 'production' ? 0.1 : 1.0,

  enableLogs: true,

  sendDefaultPii: false,
});