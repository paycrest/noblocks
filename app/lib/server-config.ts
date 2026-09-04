/**
 * Server-only configuration
 * This module contains sensitive environment variables that should NEVER be exposed to the client.
 * Only import this in API routes and server-side code (never in client components).
 *
 * Note: Cannot use "server-only" import here as this module is indirectly imported
 * through server-analytics.ts -> aggregator.ts -> KycModal.tsx chain.
 * Security is maintained because these env vars are not NEXT_PUBLIC_ prefixed.
 */

/**
 * Validates environment variable and logs a warning or throws if missing
 * @param name - Environment variable name
 * @param value - Environment variable value
 * @param required - If true, throws error when missing; if false, only warns
 */
function validateConfig(name: string, value: string, required = true): string {
  if (!value && required) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  if (!value) {
    console.warn(`[Config] Missing optional environment variable: ${name}`);
  }
  return value;
}

export const brevoConfig = {
  apiKey: validateConfig(
    "BREVO_API_KEY",
    process.env.BREVO_API_KEY || "",
    false, // Optional - Brevo integration can be disabled
  ),
  listId: validateConfig(
    "BREVO_LIST_ID",
    process.env.BREVO_LIST_ID || "",
    false, // Optional - Brevo integration can be disabled
  ),
};

export const cashbackConfig = {
  walletAddress: validateConfig(
    "CASHBACK_WALLET_ADDRESS",
    process.env.CASHBACK_WALLET_ADDRESS || "",
    false, // Optional - cashback feature can be disabled
  ),
  walletPrivateKey: validateConfig(
    "CASHBACK_WALLET_PRIVATE_KEY",
    process.env.CASHBACK_WALLET_PRIVATE_KEY || "",
    false, // Optional - cashback feature can be disabled
  ),
};

export function getServerMixpanelToken(): string {
  // Return empty string on client side
  if (typeof window !== "undefined") return "";

  return validateConfig(
    "MIXPANEL_SERVER_TOKEN",
    process.env.MIXPANEL_SERVER_TOKEN || "",
    false, // Optional - analytics can fail gracefully
  );
}

/**
 * Aggregator sender API key (UUID from the aggregator dashboard).
 *
 * SERVER-ONLY. Sent as the `API-Key` header by the /api/v1/payment-orders*
 * routes and injected into the encrypted offramp messageHash by
 * app/lib/payment-order-message-hash.ts. Never NEXT_PUBLIC_ — the value must
 * not reach the browser. Read lazily per call so a missing variable degrades
 * to a 503 at request time instead of breaking `next build` (CI builds with it
 * unset).
 */
export function getAggregatorSenderApiKey(): string {
  if (typeof window !== "undefined") return "";
  return (process.env.AGGREGATOR_SENDER_API_KEY_ID || "").trim();
}
