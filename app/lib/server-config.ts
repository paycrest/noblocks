"use server";

/**
 * Server-only configuration
 * This module contains sensitive environment variables that should NEVER be exposed to the client.
 * Only import this in API routes and server-side code.
 */

export const brevoConfig = {
  apiKey: process.env.BREVO_API_KEY || "",
  listId: process.env.BREVO_LIST_ID || "",
};

export const cashbackConfig = {
  walletAddress: process.env.CASHBACK_WALLET_ADDRESS || "",
  walletPrivateKey: process.env.CASHBACK_WALLET_PRIVATE_KEY || "",
};
