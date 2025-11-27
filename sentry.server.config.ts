import * as Sentry from "@sentry/nextjs";
import config from './app/lib/config';

Sentry.init({
  dsn: config.glitchtipDsn,
  environment: config.glitchtipEnvironment,
  release: config.glitchtipRelease,

  tracesSampleRate: config.glitchtipEnvironment === 'production' ? 0.1 : 1.0,

  enableLogs: true,
  sendDefaultPii: false,
});