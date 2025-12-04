// Server-safe analytics exports only
// For client-side analytics, import from './client'
// For server-side analytics, import from './server'

// Export only server-safe constants and utilities
export {
  ANALYTICS_EVENTS,
  ANALYTICS_PROPERTIES,
  APP_NAMES,
  trackAnalyticsEvent,
  trackPageView,
  trackUserInteraction,
  trackError,
  trackPerformance,
  performanceTracker
} from "./analytics-utils";
