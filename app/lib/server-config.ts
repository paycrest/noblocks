/**
 * Server-only configuration
 * This module contains sensitive environment variables that should NEVER be exposed to the client.
 * Only import this in API routes and server-side code (never in client components).
 *
 * Note: Cannot use "server-only" import here as this module is indirectly imported
 * through server-analytics.ts -> aggregator.ts -> KycModal.tsx chain.
 * Security is maintained because these env vars are not NEXT_PUBLIC_ prefixed.
 */

import { resolveLayerswapApiBaseUrl } from "./layerswapConfig";

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

/**
 * Mixpanel project token for server-side tracking.
 *
 * Mixpanel's server token IS the project token, so NEXT_PUBLIC_MIXPANEL_TOKEN is
 * a valid value here. It is accepted as a fallback because deployments have
 * historically set only the public name, which left every event emitted by
 * app/lib/server-analytics.ts silently dropped. Prefer MIXPANEL_SERVER_TOKEN so
 * the two can be pointed at separate projects later.
 */
export function getServerMixpanelToken(): string {
  // Return empty string on client side
  if (typeof window !== "undefined") return "";

  return validateConfig(
    "MIXPANEL_SERVER_TOKEN",
    process.env.MIXPANEL_SERVER_TOKEN ||
      process.env.NEXT_PUBLIC_MIXPANEL_TOKEN ||
      "",
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

/**
 * Canonical public origin of this deployment (e.g. https://noblocks.xyz).
 *
 * A security boundary, not a display value: it is the SIWE `domain` allowed to
 * mint a session (app/api/auth/injected/verify) and the origin allowed to POST
 * to /api/track-logout. Configured, never derived from the request Host header —
 * a phisher could otherwise have a victim sign for their domain and replay it
 * here behind a spoofed Host.
 *
 * NEXT_PUBLIC_APP_URL is the legacy name and still works. No client code reads
 * it, so the prefix only ever misrepresented this as browser-facing config.
 */
export function getAppUrl(): string {
  if (typeof window !== "undefined") return "";
  return (
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    ""
  );
}

/**
 * Moralis stream credentials, used to register deposit-watch addresses and to
 * verify the signature on incoming stream webhooks. SERVER-ONLY.
 */
export const moralisConfig = {
  streamId: process.env.MORALIS_STREAM_ID || "",
  apiKey: process.env.MORALIS_API_KEY || "",
  baseUrl: process.env.MORALIS_BASE_URL || "https://api.moralis-streams.com",
  webhookSecret: process.env.MORALIS_WEBHOOK_SECRET || "",
};

/**
 * Activepieces webhook endpoints. Each is optional — an unset URL means that
 * forward is skipped rather than failing the request. SERVER-ONLY.
 */
export const activepiecesConfig = {
  /** Deposit forwarding, fired from the Moralis stream webhook. */
  depositWebhookUrl: process.env.ACTIVEPIECES_WEBHOOK_URL || "",
  /** Signup email verification flow. */
  signupVerifyWebhookUrl:
    process.env.ACTIVEPIECES_SIGNUP_VERIFY_WEBHOOK_URL || "",
  /** KYC decision notifications (SmileID callback, tier 3, phone OTP). */
  kycResultWebhookUrl: process.env.ACTIVEPIECES_KYC_RESULT_WEBHOOK_URL || "",
};

/** LayerSwap API key (EVM earn bridge). SERVER-ONLY. */
export function getLayerswapApiKey(): string {
  if (typeof window !== "undefined") return "";
  return (process.env.LAYERSWAP_API_KEY || "").trim();
}

/**
 * LayerSwap API base URL. Read lazily rather than at module scope so the
 * validation warning in resolveLayerswapApiBaseUrl fires per call on the
 * server instead of once during `next build`.
 */
export function getLayerswapApiBase(): string {
  return resolveLayerswapApiBaseUrl(process.env.LAYERSWAP_API_BASE_URL);
}

/** CoinMarketCap Basic API key (server-only). Empty → market stats omitted. */
export function getCoinMarketCapApiKey(): string {
  if (typeof window !== "undefined") return "";
  return (process.env.COINMARKETCAP_API_KEY || "").trim();
}

/** Max CMC credits per month before budget guard (default 13500). */
export function getMarketCmcMonthlyBudget(): number {
  const raw = process.env.MARKET_CMC_MONTHLY_BUDGET;
  const n = raw ? Number(raw) : 13500;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 13500;
}

/** Replica count for splitting the CMC daily budget (default 1). */
export function getMarketDataReplicas(): number {
  const raw = process.env.MARKET_DATA_REPLICAS;
  const n = raw ? Number(raw) : 1;
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/** cNGN depeg badge threshold in percent (default 2). */
export function getMarketCngnDepegBadgePct(): number {
  const raw = process.env.MARKET_CNGN_DEPEG_BADGE_PCT;
  const n = raw ? Number(raw) : 2;
  return Number.isFinite(n) && n > 0 ? n : 2;
}

const PUBLIC_RPC_FALLBACK: Record<string, string> = {
  base: "https://mainnet.base.org",
  arbitrum: "https://arb1.arbitrum.io/rpc",
  celo: "https://forno.celo.org",
};

const DWELLIR_HOST: Record<string, string> = {
  base: "https://api-base-mainnet-archive.n.dwellir.com",
  arbitrum: "https://api-arbitrum-mainnet-archive.n.dwellir.com",
  celo: "https://api-celo-mainnet-archive.n.dwellir.com",
};

/**
 * Server-only RPC URL for Chainlink oracle reads (separate from NEXT_PUBLIC_RPC_URL_KEY).
 */
export function getMarketDataRpcUrl(chain: "base" | "arbitrum" | "celo"): string {
  if (typeof window !== "undefined") return "";
  const key = (process.env.MARKET_DATA_RPC_KEY || "").trim();
  const host = DWELLIR_HOST[chain];
  if (key && host) return `${host}/${key}`;
  if (process.env.NODE_ENV !== "production") {
    return PUBLIC_RPC_FALLBACK[chain] ?? PUBLIC_RPC_FALLBACK.base;
  }
  return host ?? PUBLIC_RPC_FALLBACK.base;
}
