/**
 * Privy Wallet API authorization helpers
 * Based on: https://github.com/starknet-edu/starknet-privy-demo
 */

import { createPrivateKey, createPublicKey, randomBytes, sign } from "crypto";
import { type WalletApiRequestSignatureInput } from "@privy-io/server-auth";

/**
 * Generate or retrieve a user-specific authorization key for Privy Wallet API
 * In production, you might want to cache this per user
 */
export async function getUserAuthorizationKey(opts: {
  userJwt: string;
  userId?: string;
}): Promise<string> {
  // For simplicity, generate a new key pair
  // In production, you'd want to store and reuse keys per user
  const { privateKey } = generateKeyPair();
  return privateKey;
}

/**
 * Generate a new ECDSA P-256 key pair
 */
function generateKeyPair(): { privateKey: string; publicKey: string } {
  const { privateKey: privKey, publicKey: pubKey } = require("crypto").generateKeyPairSync(
    "ec",
    {
      namedCurve: "prime256v1", // P-256
      publicKeyEncoding: {
        type: "spki",
        format: "pem",
      },
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem",
      },
    }
  );

  return {
    privateKey: privKey,
    publicKey: pubKey,
  };
}

/**
 * Build authorization signature for Privy Wallet API request
 */
export function buildAuthorizationSignature(opts: {
  input: WalletApiRequestSignatureInput;
  authorizationKey: string;
}): string {
  const { input, authorizationKey } = opts;

  // Build the signature payload
  const payload = JSON.stringify({
    version: input.version,
    method: input.method,
    url: input.url,
    body: input.body,
    headers: input.headers,
  });

  // Sign with the authorization key
  const privateKeyObj = createPrivateKey(authorizationKey);
  const signature = sign("sha256", Buffer.from(payload), privateKeyObj);

  return signature.toString("base64");
}
