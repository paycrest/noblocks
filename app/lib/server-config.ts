"use server";

/**
 * Server-only configuration
 * This module contains sensitive environment variables that should NEVER be exposed to the client.
 * Only import this in API routes and server-side code.
 */

/**
 * Validates environment variable and logs a warning if missing
 */
function validateConfig(name: string, value: string): string {
  if (!value) {
    console.warn(`[Config] Missing environment variable: ${name}`);
  }
  return value;
}

export const brevoConfig = {
  apiKey: validateConfig("BREVO_API_KEY", process.env.BREVO_API_KEY || ""),
  listId: validateConfig("BREVO_LIST_ID", process.env.BREVO_LIST_ID || ""),
};

export const cashbackConfig = {
  walletAddress: validateConfig(
    "CASHBACK_WALLET_ADDRESS",
    process.env.CASHBACK_WALLET_ADDRESS || "",
  ),
  walletPrivateKey: validateConfig(
    "CASHBACK_WALLET_PRIVATE_KEY",
    process.env.CASHBACK_WALLET_PRIVATE_KEY || "",
  ),
};
