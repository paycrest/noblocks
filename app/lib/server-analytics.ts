import Mixpanel from 'mixpanel';
import { NextRequest } from 'next/server';
import config from './config';

// Initialize Mixpanel server-side instance
const mixpanel = Mixpanel.init(config.mixpanelToken, {
  debug: process.env.NODE_ENV === 'development',
  protocol: 'https',
});

// Types for server-side tracking
export interface ServerEventProperties {
  [key: string]: any;
  app?: string;
  server_side?: boolean;
  timestamp?: string;
  user_agent?: string;
  ip_address?: string;
  request_id?: string;
}

export interface UserProperties {
  [key: string]: any;
  $last_seen?: string;
  $created?: string;
  $email?: string;
  $name?: string;
  login_method?: string;
  isNewUser?: boolean;
  wallet_address?: string;
}

/**
 * Server-side event tracking
 * Tracks events from API routes and server components
 */
export const trackServerEvent = (
  eventName: string,
  properties: ServerEventProperties = {},
  distinctId?: string
) => {
  try {
    if (!config.mixpanelToken) {
      console.warn('Mixpanel token not configured for server-side tracking');
      return;
    }

    const eventData = {
      ...properties,
      app: 'Noblocks',
      server_side: true,
      timestamp: new Date().toISOString(),
    };

    // Add distinct_id to event data if provided
    const finalEventData = distinctId 
      ? { ...eventData, distinct_id: distinctId }
      : eventData;
    
    mixpanel.track(eventName, finalEventData);

    if (process.env.NODE_ENV === 'development') {
      console.log(`[Server Analytics] ${eventName}:`, eventData);
    }
  } catch (error) {
    console.error('Server-side tracking error:', error);
  }
};

/**
 * Server-side user identification and property setting
 */
export const identifyServerUser = (
  distinctId: string,
  properties: UserProperties = {}
) => {
  try {
    if (!config.mixpanelToken) {
      console.warn('Mixpanel token not configured for server-side tracking');
      return;
    }

    const userData = {
      ...properties,
      $last_seen: new Date().toISOString(),
      app: 'Noblocks',
      server_side: true,
    };

    mixpanel.people.set(distinctId, userData);

    if (process.env.NODE_ENV === 'development') {
      console.log(`[Server Analytics] User identified:`, distinctId, userData);
    }
  } catch (error) {
    console.error('Server-side user identification error:', error);
  }
};

/**
 * Track API request events
 */
export const trackApiRequest = (
  request: NextRequest,
  endpoint: string,
  method: string,
  properties: ServerEventProperties = {}
) => {
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const ip = request.headers.get('x-forwarded-for') || 
            request.headers.get('x-real-ip') || 
            'unknown';
  
  trackServerEvent('API Request', {
    ...properties,
    endpoint,
    method,
    user_agent: userAgent,
    ip_address: ip,
    request_id: crypto.randomUUID(),
  });
};

/**
 * Track API response events
 */
export const trackApiResponse = (
  endpoint: string,
  method: string,
  statusCode: number,
  responseTime: number,
  properties: ServerEventProperties = {}
) => {
  trackServerEvent('API Response', {
    ...properties,
    endpoint,
    method,
    status_code: statusCode,
    response_time_ms: responseTime,
  });
};

/**
 * Track API error events
 */
export const trackApiError = (
  request: NextRequest,
  endpoint: string,
  method: string,
  error: Error,
  statusCode: number = 500,
  properties: ServerEventProperties = {}
) => {
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const ip = request.headers.get('x-forwarded-for') || 
            request.headers.get('x-real-ip') || 
            'unknown';

  trackServerEvent('API Error', {
    ...properties,
    endpoint,
    method,
    status_code: statusCode,
    error_message: error.message,
    error_stack: error.stack,
    user_agent: userAgent,
    ip_address: ip,
    request_id: crypto.randomUUID(),
  });
};

/**
 * Track transaction events from server-side
 */
export const trackTransactionEvent = (
  eventName: string,
  walletAddress: string,
  properties: ServerEventProperties = {}
) => {
  trackServerEvent(eventName, {
    ...properties,
    wallet_address: walletAddress,
    transaction_type: 'crypto_to_fiat',
  }, walletAddress);
};

/**
 * Track funding events from server-side
 */
export const trackFundingEvent = (
  eventName: string,
  walletAddress: string,
  properties: ServerEventProperties = {}
) => {
  trackServerEvent(eventName, {
    ...properties,
    wallet_address: walletAddress,
    funding_type: 'wallet_funding',
  }, walletAddress);
};

/**
 * Track authentication events from server-side
 */
export const trackAuthEvent = (
  eventName: string,
  walletAddress: string,
  properties: ServerEventProperties = {}
) => {
  trackServerEvent(eventName, {
    ...properties,
    wallet_address: walletAddress,
    auth_type: 'wallet_authentication',
  }, walletAddress);
};

/**
 * Track business logic events
 */
export const trackBusinessEvent = (
  eventName: string,
  properties: ServerEventProperties = {},
  distinctId?: string
) => {
  trackServerEvent(eventName, {
    ...properties,
    business_event: true,
  }, distinctId);
};

/**
 * Track system events (errors, warnings, etc.)
 */
export const trackSystemEvent = (
  eventName: string,
  level: 'info' | 'warning' | 'error' | 'critical',
  properties: ServerEventProperties = {}
) => {
  trackServerEvent(eventName, {
    ...properties,
    system_event: true,
    log_level: level,
  });
};

// Note: Mixpanel server library automatically handles event batching and sending
// No manual flush is needed as events are sent immediately
