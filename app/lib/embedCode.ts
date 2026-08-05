/**
 * Deterministic embed code derivation from parent origin.
 *
 * Produces a short, stable identifier for each allowlisted embedding partner
 * so onchain calldata can attribute volume to host sites without relying on
 * middleware analytics alone. The code is computed as:
 *
 *   e_ + first 8 hex chars of sha256(normalizedOrigin)
 *
 * Normalization: lowercase the full origin, strip any trailing slash. This
 * ensures https://App.Partner.COM/ and https://app.partner.com produce the
 * same code. The algorithm is documented here and in tests so the code can
 * be reproduced at analytics/query time against embed_allowed_origins.
 *
 * Works in both browser (Web Crypto) and Node.js (crypto module).
 *
 * Usage: compute once when parentOrigin is resolved (e.g. in EmbedContext),
 * cache the result, and pass it to attribution helpers at transaction time.
 */

/**
 * Normalize an origin for hashing: lowercase, strip trailing slash.
 * Does NOT validate — caller must ensure origin is allowlisted before calling.
 */
export function normalizeOrigin(origin: string): string {
  return origin.toLowerCase().replace(/\/+$/, "");
}

/**
 * Compute the embed code for a given origin.
 * Returns null if origin is empty or null.
 *
 * Algorithm: e_ + first 8 hex chars of sha256(normalizedOrigin)
 * Example: https://app.partner.com → e_a1b2c3d4
 *
 * This is async because Web Crypto (browser + modern Node) requires it.
 * Compute once at embed init and cache the result.
 */
export async function computeEmbedCode(
  origin: string | null | undefined,
): Promise<string | null> {
  if (!origin) return null;

  const normalized = normalizeOrigin(origin);
  if (!normalized) return null;

  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);

  let hashBytes: Uint8Array;
  if (typeof crypto !== "undefined" && crypto.subtle) {
    // Browser or Node 15+ with Web Crypto
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    hashBytes = new Uint8Array(hashBuffer);
  } else {
    // Fallback for older Node versions
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require("crypto") as typeof import("crypto");
    const hash = nodeCrypto.createHash("sha256");
    hash.update(normalized);
    hashBytes = new Uint8Array(hash.digest());
  }

  const hashArray = Array.from(hashBytes);
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `e_${hashHex.slice(0, 8)}`;
}

/**
 * Encode an embed code as hex bytes suitable for calldata appending.
 * Returns the hex string (without 0x prefix) for the given embed code.
 *
 * Example: "e_a1b2c3d4" → "655f6131623263336434"
 */
export function embedCodeToHex(embedCode: string): string {
  const bytes = new TextEncoder().encode(embedCode);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
