import { NextRequest } from "next/server";
import { getServerMixpanelToken } from "./server-config";
import { captureException } from "./sentry";

// Check if we're on the server
const isServer = typeof window === "undefined";

// Conditionally import crypto only on server
let crypto: typeof import("crypto") | null = null;
if (isServer) {
  crypto = require("crypto");
}

// Lazy load Mixpanel to avoid webpack issues
let mixpanel: any = null;

const getMixpanel = () => {
  if (!isServer) return null; // Skip on client

  const serverToken = getServerMixpanelToken();
  if (!mixpanel && serverToken) {
    try {
      const Mixpanel = require("mixpanel");
      mixpanel = Mixpanel.init(serverToken, {
        debug: process.env.NODE_ENV === "development",
        protocol: "https",
      });
    } catch (error) {
      console.warn(
        "Mixpanel not available:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  return mixpanel;
};

// Privacy configuration
const PRIVACY_MODE = process.env.MIXPANEL_PRIVACY_MODE === "strict";
const INCLUDE_IP = process.env.MIXPANEL_INCLUDE_IP === "true";
const INCLUDE_ERROR_STACKS =
  process.env.MIXPANEL_INCLUDE_ERROR_STACKS === "true";

// Utility functions for privacy-safe tracking
const hashWalletAddress = (walletAddress: string): string => {
  if (!walletAddress || !crypto) return "";
  return crypto
    .createHash("sha256")
    .update(walletAddress.toLowerCase())
    .digest("hex")
    .substring(0, 8);
};

const hashTransactionId = (transactionId: string): string => {
  if (!transactionId || !crypto) return "";
  return crypto
    .createHash("sha256")
    .update(transactionId)
    .digest("hex")
    .substring(0, 8);
};

const hashIPAddress = (ip: string): string => {
  if (!ip || ip === "unknown" || !crypto) return "";
  return crypto.createHash("sha256").update(ip).digest("hex").substring(0, 8);
};

const sanitizeProperties = (
  properties: Record<string, any>,
): Record<string, any> => {
  const sanitized = { ...properties };

  // Hash sensitive fields
  if (sanitized.wallet_address) {
    sanitized.wallet_address_hash = hashWalletAddress(sanitized.wallet_address);
    delete sanitized.wallet_address;
  }

  if (sanitized.transaction_id) {
    sanitized.transaction_id_hash = hashTransactionId(sanitized.transaction_id);
    delete sanitized.transaction_id;
  }

  if (sanitized.tx_hash) {
    sanitized.tx_hash_hash = hashTransactionId(sanitized.tx_hash);
    delete sanitized.tx_hash;
  }

  // Handle IP addresses based on privacy settings
  if (sanitized.ip_address) {
    if (PRIVACY_MODE || !INCLUDE_IP) {
      sanitized.ip_address_hash = hashIPAddress(sanitized.ip_address);
      delete sanitized.ip_address;
    }
  }

  // Handle error stacks based on privacy settings
  if (sanitized.error_stack && (PRIVACY_MODE || !INCLUDE_ERROR_STACKS)) {
    delete sanitized.error_stack;
  }

  return sanitized;
};

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
  distinctId?: string,
) => {
  // Skip tracking on client side
  if (!isServer) return;

  try {
    const serverToken = getServerMixpanelToken();
    if (!serverToken) {
      console.warn("Mixpanel token not configured for server-side tracking");
      return;
    }

    const mixpanelInstance = getMixpanel();
    if (!mixpanelInstance) {
      console.warn("Mixpanel not available");
      return;
    }

    const eventData = {
      ...sanitizeProperties(properties),
      app: "Noblocks",
      server_side: true,
      timestamp: new Date().toISOString(),
    };

    // Add distinct_id to event data if provided
    const finalEventData = distinctId
      ? { ...eventData, distinct_id: distinctId }
      : eventData;

    // Debug logging for development
    if (process.env.NODE_ENV === "development") {
      console.log("Sending server-side event to Mixpanel:", {
        event: eventName,
        properties: finalEventData,
      });
    }

    mixpanelInstance.track(eventName, finalEventData);
  } catch (error) {
    console.error("Server-side tracking error:", error);
  }
};

/**
 * Server-side user identification and property setting
 */
export const identifyServerUser = (
  distinctId: string,
  properties: UserProperties = {},
) => {
  try {
    const serverToken = getServerMixpanelToken();
    if (!serverToken) {
      console.warn("Mixpanel token not configured for server-side tracking");
      return;
    }

    const mixpanelInstance = getMixpanel();
    if (!mixpanelInstance) {
      console.warn("Mixpanel not available");
      return;
    }

    const userData = {
      ...properties,
      $last_seen: new Date().toISOString(),
      app: "Noblocks",
      server_side: true,
    };

    mixpanelInstance.people.set(distinctId, userData);
  } catch (error) {
    console.error("Server-side user identification error:", error);
  }
};

/**
 * Track API request events
 */
export const trackApiRequest = (
  request: NextRequest,
  endpoint: string,
  method: string,
  properties: ServerEventProperties = {},
) => {
  // Skip tracking on client side
  if (!isServer) return;

  const userAgent = request.headers.get("user-agent") || "unknown";
  const ip =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "unknown";

  trackServerEvent("API Request", {
    ...sanitizeProperties(properties),
    endpoint,
    method,
    user_agent: userAgent,
    ip_address: ip,
    request_id: crypto?.randomUUID() || "unknown",
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
  properties: ServerEventProperties = {},
) => {
  // Skip tracking on client side
  if (!isServer) return;

  trackServerEvent("API Response", {
    ...sanitizeProperties(properties),
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
  properties: ServerEventProperties = {},
) => {
  // Skip tracking on client side
  if (!isServer) return;

  const userAgent = request.headers.get("user-agent") || "unknown";
  const ip =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "unknown";

  trackServerEvent("API Error", {
    ...sanitizeProperties(properties),
    endpoint,
    method,
    status_code: statusCode,
    error_message: error.message,
    error_stack: error.stack,
    user_agent: userAgent,
    ip_address: ip,
    request_id: crypto?.randomUUID() || "unknown",
  });

  // Track to Sentry
  captureException(error, {
    level: "error",
    tags: {
      errorType: "apiError",
      endpoint,
      method,
      statusCode: String(statusCode),
    },
    extra: {
      ...sanitizeProperties(properties),
      status_code: statusCode,
      error_message: error.message,
    },
    request: {
      url: endpoint,
      method,
      headers: Object.fromEntries(request.headers.entries()),
      query_string: request.nextUrl.search,
    },
    user: {
      ip_address: ip !== "unknown" ? ip : undefined,
    },
  }).catch(() => {
    // Silently fail - don't break the app if Sentry fails
  });
};

/**
 * Track transaction events from server-side
 */
export const trackTransactionEvent = (
  eventName: string,
  walletAddress: string,
  properties: ServerEventProperties = {},
) => {
  const distinct = PRIVACY_MODE
    ? hashWalletAddress(walletAddress)
    : walletAddress;
  trackServerEvent(
    eventName,
    {
      ...properties,
      wallet_address: walletAddress,
      transaction_type: "crypto_to_fiat",
    },
    distinct,
  );
};

/**
 * Track funding events from server-side
 */
export const trackFundingEvent = (
  eventName: string,
  walletAddress: string,
  properties: ServerEventProperties = {},
) => {
  const distinct = PRIVACY_MODE
    ? hashWalletAddress(walletAddress)
    : walletAddress;
  trackServerEvent(
    eventName,
    {
      ...properties,
      wallet_address: walletAddress,
      funding_type: "wallet_funding",
    },
    distinct,
  );
};

/**
 * Track authentication events from server-side
 */
export const trackAuthEvent = (
  eventName: string,
  walletAddress: string,
  properties: ServerEventProperties = {},
) => {
  const distinct = PRIVACY_MODE
    ? hashWalletAddress(walletAddress)
    : walletAddress;
  trackServerEvent(
    eventName,
    {
      ...properties,
      wallet_address: walletAddress,
      auth_type: "wallet_authentication",
    },
    distinct,
  );
};

/**
 * Track business logic events
 */
export const trackBusinessEvent = (
  eventName: string,
  properties: ServerEventProperties = {},
  distinctId?: string,
) => {
  trackServerEvent(
    eventName,
    {
      ...sanitizeProperties(properties),
      business_event: true,
    },
    distinctId,
  );
};

/**
 * Track system events (errors, warnings, etc.)
 */
export const trackSystemEvent = (
  eventName: string,
  level: "info" | "warning" | "error" | "critical",
  properties: ServerEventProperties = {},
) => {
  trackServerEvent(eventName, {
    ...properties,
    system_event: true,
    log_level: level,
  });
};
