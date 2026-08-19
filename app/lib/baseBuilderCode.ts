import { concatHex, type Hex } from "viem";

/**
 * Onchain attribution for Noblocks transactions via ERC-8021 data suffixes.
 *
 * Two codes can ride on a transaction:
 * - The Base builder code, which attributes Base mainnet volume to Noblocks.
 * - An embed code, which attributes volume to the allowlisted partner site
 *   the widget is embedded in.
 *
 * Both are execution-inert trailing calldata: contracts ignore bytes beyond
 * their expected ABI arguments, so the suffix costs gas but changes nothing.
 */

export const BASE_MAINNET_CHAIN_ID = 8453;

/**
 * bc_julg9gbq - Noblocks' registered Base builder code, used for base.dev
 * analytics and rewards on Base mainnet.
 *
 * Precomputed ERC-8021 schema 0 suffix for the single code "bc_julg9gbq":
 * - Codes: "bc_julg9gbq" (11 bytes)
 * - Length byte: 0x0b (11)
 * - Schema byte: 0x00
 * - Marker: 0x8021 repeated 8 times (16 bytes)
 *
 * Total: 29 bytes
 */
export const BASE_BUILDER_CODE_SUFFIX =
  "0x62635f6a756c67396762710b0080218021802180218021802180218021" as const;

/**
 * ERC-8021 schema 0 marker: 0x8021 repeated 8 times (16 bytes).
 * Each 0x8021 is 2 bytes, so 8 x 2 = 16 bytes = 32 hex chars.
 */
const ERC8021_MARKER = "8021".repeat(8);

/**
 * Encode a string as hex bytes (no 0x prefix).
 * Example: "bc_julg9gbq,e_233809b4" -> "62635f6a756c67396762712c655f3233333830396234"
 */
function stringToHex(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Build an ERC-8021 schema 0 suffix from comma-separated codes.
 *
 * Structure (read right-to-left per ERC-8021):
 * [codes ASCII][1-byte codes length][1-byte schema id 0x00][16-byte marker 0x8021...]
 *
 * Example: codes = "bc_julg9gbq,e_233809b4" (22 bytes)
 * -> 62635f6a756c67396762712c655f3233333830396234 16 00 8021...8021
 *
 * The aggregator's EncodeERC8021Suffix in Go produces byte-identical output.
 *
 * Note: a multi-code suffix is NOT BASE_BUILDER_CODE_SUFFIX with another code
 * bolted on. That constant is the complete encoding of the single code
 * "bc_julg9gbq", trailer included. Adding a second code means rebuilding the
 * whole suffix from the full code list so there is exactly one
 * length/schema/marker trailer per transaction, which is what this does.
 */
function buildERC8021Suffix(codes: string): string {
  const codesHex = stringToHex(codes);
  const codesLength = codes.length;

  // Validate: codes must be non-empty, <= 255 bytes, and ASCII printable
  if (codesLength === 0 || codesLength > 255) {
    throw new Error(`ERC-8021 codes length out of range: ${codesLength}`);
  }
  for (let i = 0; i < codes.length; i++) {
    const code = codes.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) {
      throw new Error(`ERC-8021 codes contain non-printable character at position ${i}`);
    }
  }

  const lengthByte = codesLength.toString(16).padStart(2, "0");
  const schemaByte = "00";

  return `${codesHex}${lengthByte}${schemaByte}${ERC8021_MARKER}`;
}

/* -------------------------------------------------------------------------- */
/* Embed code derivation                                                      */
/* -------------------------------------------------------------------------- */

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
 * cache the result, and pass it to the append helpers at transaction time.
 */

/**
 * Normalize an origin for hashing: lowercase, strip trailing slash.
 * Does NOT validate: caller must ensure origin is allowlisted before calling.
 */
export function normalizeOrigin(origin: string): string {
  return origin.toLowerCase().replace(/\/+$/, "");
}

/**
 * Compute the embed code for a given origin.
 * Returns null if origin is empty or null.
 *
 * Algorithm: e_ + first 8 hex chars of sha256(normalizedOrigin)
 * Example: https://app.partner.com -> e_a1b2c3d4
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

  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashBytes = new Uint8Array(hashBuffer);

  const hashArray = Array.from(hashBytes);
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `e_${hashHex.slice(0, 8)}`;
}

/**
 * Shape of a derived embed code: `e_` followed by 8 lowercase hex chars.
 * Kept next to computeEmbedCode so the validator and the derivation stay in sync.
 */
export const EMBED_CODE_PATTERN = /^e_[0-9a-f]{8}$/;

/**
 * Whether a value is a well-formed embed code.
 *
 * Use at trust boundaries that accept a code from the client (e.g. the sponsored
 * bundler route): the code is appended to calldata the sponsor pays gas for, so an
 * unvalidated value lets a caller pad calldata or attribute their transaction to an
 * arbitrary code. This checks shape only: it does not prove the caller is the origin
 * the code was derived from, which is not verifiable for wildcard allowlist entries.
 */
export function isValidEmbedCode(value: unknown): value is string {
  return typeof value === "string" && EMBED_CODE_PATTERN.test(value);
}

/**
 * Encode an embed code as hex bytes suitable for calldata appending.
 * Returns the hex string (without 0x prefix) for the given embed code.
 *
 * Example: "e_a1b2c3d4" -> "655f6131623263336434"
 */
export function embedCodeToHex(embedCode: string): string {
  return stringToHex(embedCode);
}

/* -------------------------------------------------------------------------- */
/* Calldata appending                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Append the Base builder code suffix to calldata (Base mainnet only).
 * @deprecated Use appendAttributionSuffix for multi-code ERC-8021 support.
 */
export function appendBaseBuilderCode(chainId: number, data: Hex): Hex {
  if (chainId !== BASE_MAINNET_CHAIN_ID) return data;
  return concatHex([data, BASE_BUILDER_CODE_SUFFIX]);
}

/**
 * Append attribution suffixes to calldata per ERC-8021 multi-code schema.
 *
 * On Base mainnet with embedCode:
 *   Builds ERC-8021 suffix for "bc_julg9gbq,<embedCode>"
 *   -> Full schema 0 structure with both codes comma-separated
 *
 * On other chains with embedCode:
 *   Builds ERC-8021 suffix for "<embedCode>" only
 *   -> Full schema 0 structure with single code
 *
 * Without embedCode:
 *   Base mainnet gets BASE_BUILDER_CODE_SUFFIX (precomputed), others get nothing.
 *
 * The embedCode must already be validated against the allowlist before calling.
 * Format: e_ + 8 hex chars (e.g., e_233809b4)
 */
export function appendAttributionSuffix(
  chainId: number,
  data: Hex,
  embedCode?: string | null,
): Hex {
  const isBase = chainId === BASE_MAINNET_CHAIN_ID;

  // No embed code (null, undefined, or empty): Base gets its builder code, others get nothing
  if (!embedCode || embedCode.length === 0) {
    return isBase ? concatHex([data, BASE_BUILDER_CODE_SUFFIX]) : data;
  }

  // Base mainnet: bc_julg9gbq,<embedCode>
  if (isBase) {
    const codes = `bc_julg9gbq,${embedCode}`;
    const suffix = `0x${buildERC8021Suffix(codes)}` as Hex;
    return concatHex([data, suffix]);
  }

  // Other chains: embedCode only
  const suffix = `0x${buildERC8021Suffix(embedCode)}` as Hex;
  return concatHex([data, suffix]);
}

/**
 * Append only the embed code to calldata (no Base builder code).
 *
 * Use this when the Base builder code is already appended by another mechanism
 * (e.g., Privy's dataSuffix plugin). This builds a proper ERC-8021 suffix
 * for the embed code alone.
 *
 * Returns data unchanged if embedCode is null/undefined.
 */
export function appendEmbedCodeOnly(data: Hex, embedCode?: string | null): Hex {
  if (!embedCode || embedCode.length === 0) return data;
  const suffix = `0x${buildERC8021Suffix(embedCode)}` as Hex;
  return concatHex([data, suffix]);
}
