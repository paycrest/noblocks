/**
 * Analytics Utilities for Consistent Tracking
 * Provides standardized tracking functions across all applications
 */

import { trackEvent as trackEventNoblocks } from './useMixpanel';

// Standard event names for consistency
export const ANALYTICS_EVENTS = {
  // Page Events
  PAGE_VIEW: 'Page Viewed',
  PAGE_LOAD: 'Page Loaded',

  // User Events
  USER_LOGIN: 'User Login',
  USER_LOGOUT: 'User Logout',
  USER_REGISTER: 'User Register',
  USER_IDENTIFY: 'User Identified',

  // Transaction Events
  TRANSACTION_STARTED: 'Transaction Started',
  TRANSACTION_COMPLETED: 'Transaction Completed',
  TRANSACTION_FAILED: 'Transaction Failed',
  TRANSACTION_CANCELLED: 'Transaction Cancelled',

  // UI Events
  BUTTON_CLICK: 'Button Clicked',
  LINK_CLICK: 'Link Clicked',
  FORM_SUBMIT: 'Form Submitted',
  MODAL_OPEN: 'Modal Opened',
  MODAL_CLOSE: 'Modal Closed',

  // Blog Events
  BLOG_READ_START: 'Blog Reading Started',
  BLOG_READ_COMPLETE: 'Blog Reading Completed',
  BLOG_CARD_CLICK: 'Blog Card Clicked',
  BLOG_SEARCH: 'Blog Search',

  // Error Events
  ERROR_OCCURRED: 'Error Occurred',
  API_ERROR: 'API Error',

  // Business Events
  ORDER_CREATED: 'Order Created',
  ORDER_UPDATED: 'Order Updated',
  FEE_UPDATED: 'Fee Updated',
  SETTINGS_CHANGED: 'Settings Changed',
} as const;

// Standard property names for consistency
export const ANALYTICS_PROPERTIES = {
  // User Properties
  USER_ID: 'user_id',
  WALLET_ADDRESS: 'wallet_address',
  LOGIN_METHOD: 'login_method',
  IS_NEW_USER: 'is_new_user',

  // Page Properties
  PAGE_NAME: 'page_name',
  PAGE_URL: 'page_url',
  REFERRER: 'referrer',

  // Transaction Properties
  TRANSACTION_ID: 'transaction_id',
  TRANSACTION_AMOUNT: 'transaction_amount',
  TRANSACTION_CURRENCY: 'transaction_currency',
  TRANSACTION_STATUS: 'transaction_status',
  TRANSACTION_TYPE: 'transaction_type',

  // UI Properties
  ELEMENT_ID: 'element_id',
  ELEMENT_TYPE: 'element_type',
  ELEMENT_TEXT: 'element_text',
  ELEMENT_POSITION: 'element_position',

  // Error Properties
  ERROR_MESSAGE: 'error_message',
  ERROR_CODE: 'error_code',
  ERROR_STACK: 'error_stack',

  // Performance Properties
  LOAD_TIME: 'load_time_ms',
  RESPONSE_TIME: 'response_time_ms',
  RENDER_TIME: 'render_time_ms',
} as const;

// Standard app identifiers
export const APP_NAMES = {
  NOBLOCKS: 'Noblocks',
  DASHBOARD: 'Dashboard v1',
  LANDING_PAGE: 'Landing Page',
} as const;

/**
 * Enhanced tracking function with standardized properties
 */
export const trackAnalyticsEvent = (
  eventName: string,
  properties: Record<string, any> = {},
  appName: string = APP_NAMES.NOBLOCKS
) => {
  const enhancedProperties = {
    ...properties,
    app: appName,
    timestamp: new Date().toISOString(),
    session_id: getSessionId(),
    user_agent: typeof window !== 'undefined' ? window.navigator.userAgent : 'server',
  };

  trackEventNoblocks(eventName, enhancedProperties);
};

/**
 * Track page views with enhanced data
 */
export const trackPageView = (
  pageName: string,
  properties: Record<string, any> = {},
  appName: string = APP_NAMES.NOBLOCKS
) => {
  trackAnalyticsEvent(ANALYTICS_EVENTS.PAGE_VIEW, {
    [ANALYTICS_PROPERTIES.PAGE_NAME]: pageName,
    [ANALYTICS_PROPERTIES.PAGE_URL]: typeof window !== 'undefined' ? window.location.href : '',
    [ANALYTICS_PROPERTIES.REFERRER]: typeof window !== 'undefined' ? document.referrer : '',
    ...properties,
  }, appName);
};

/**
 * Track user interactions
 */
export const trackUserInteraction = (
  interactionType: string,
  elementId: string,
  properties: Record<string, any> = {},
  appName: string = APP_NAMES.NOBLOCKS
) => {
  trackAnalyticsEvent(interactionType, {
    [ANALYTICS_PROPERTIES.ELEMENT_ID]: elementId,
    [ANALYTICS_PROPERTIES.ELEMENT_TYPE]: getElementType(elementId),
    ...properties,
  }, appName);
};

/**
 * Track errors with enhanced context
 */
export const trackError = (
  error: Error,
  context: Record<string, any> = {},
  appName: string = APP_NAMES.NOBLOCKS
) => {
  const isProd = typeof process !== 'undefined' && process.env.NODE_ENV === 'production';
  trackAnalyticsEvent(ANALYTICS_EVENTS.ERROR_OCCURRED, {
    [ANALYTICS_PROPERTIES.ERROR_MESSAGE]: error.message,
    [ANALYTICS_PROPERTIES.ERROR_CODE]: error.name,
    ...(isProd ? {} : { [ANALYTICS_PROPERTIES.ERROR_STACK]: error.stack }),
    ...context,
  }, appName);

  // Track to Sentry for client-side errors
  if (typeof window !== "undefined") {
    import("@/app/lib/sentry").then(({ captureException }) => {
      captureException(error, {
        level: "error",
        tags: {
          app: appName,
          errorSource: "analyticsUtils",
        },
        extra: context,
      }).catch(() => {
        // Silently fail
      });
    });
  }
};

/**
 * Track performance metrics
 */
export const trackPerformance = (
  metricName: string,
  value: number,
  properties: Record<string, any> = {},
  appName: string = APP_NAMES.NOBLOCKS
) => {
  trackAnalyticsEvent('Performance Metric', {
    metric_name: metricName,
    metric_value: value,
    ...properties,
  }, appName);
};

// Helper functions
function getSessionId(): string {
  if (typeof window === 'undefined') return 'server';

  let sessionId = sessionStorage.getItem('analytics_session_id');
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('analytics_session_id', sessionId);
  }
  return sessionId;
}

function getElementType(elementId: string): string {
  if (typeof window === 'undefined') return 'unknown';

  const element = document.getElementById(elementId);
  if (!element) return 'unknown';

  return element.tagName.toLowerCase();
}

// Performance tracking utilities
export const performanceTracker = {
  start: (name: string) => {
    if (typeof window !== 'undefined' && 'performance' in window) {
      performance.mark(`${name}_start`);
    }
  },

  end: (name: string) => {
    if (typeof window !== 'undefined' && 'performance' in window) {
      performance.mark(`${name}_end`);
      performance.measure(name, `${name}_start`, `${name}_end`);

      const measure = performance.getEntriesByName(name)[0];
      if (measure) {
        trackPerformance(name, measure.duration);
      }
    }
  },

  measure: (name: string, fn: () => void) => {
    performanceTracker.start(name);
    fn();
    performanceTracker.end(name);
  }
};

// Export specific utilities from useMixpanel (excluding trackPageView to avoid collision)
export {
  initMixpanel,
  useMixpanel,
  identifyUser,
  trackEvent,
  trackBlogCardClick,
  trackBlogReadingStarted,
  trackBlogReadingCompleted,
  trackCopyLink,
  trackGetStartedClick,
  trackRecentBlogClick,
  trackSearch,
  trackFooterLinkClick,
  trackSocialShare
} from './useMixpanel';
