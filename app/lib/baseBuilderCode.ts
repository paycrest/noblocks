import { concatHex, type Hex } from "viem";

export const BASE_MAINNET_CHAIN_ID = 8453;

/**
 * bc_julg9gbq — Base builder code suffix.
 * Must match aggregator/services/builder_code.go.
 *
 * This is a precomputed ERC-8021 schema 0 suffix for the single code "bc_julg9gbq":
 * - Codes: "bc_julg9gbq" (11 bytes)
 * - Length byte: 0x0b (11)
 * - Schema byte: 0x00
 * - Marker: 0x8021 repeated 16 times
 *
 * Total: 29 bytes
 */
export const BASE_BUILDER_CODE_SUFFIX =
  "0x62635f6a756c67396762710b0080218021802180218021802180218021" as const;

/**
 * Append the Base builder code suffix to calldata (Base mainnet only).
 * @deprecated Use appendAttributionSuffix for multi-code ERC-8021 support.
 */
export function appendBaseBuilderCode(chainId: number, data: Hex): Hex {
  if (chainId !== BASE_MAINNET_CHAIN_ID) return data;
  return concatHex([data, BASE_BUILDER_CODE_SUFFIX]);
}

/**
 * Encode a string as hex bytes (no 0x prefix).
 * Example: "bc_julg9gbq,e_233809b4" → "62635f6a756c67396762712c655f3233333830396234"
 */
function stringToHex(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * ERC-8021 schema 0 marker: 0x8021 repeated 8 times (16 bytes).
 * Each 0x8021 is 2 bytes, so 8 × 2 = 16 bytes = 32 hex chars.
 */
const ERC8021_MARKER = "8021".repeat(8);

/**
 * Build an ERC-8021 schema 0 suffix from comma-separated codes.
 *
 * Structure (read right-to-left per ERC-8021):
 * [codes ASCII][1-byte codes length][1-byte schema id 0x00][16-byte marker 0x8021...]
 *
 * Example: codes = "bc_julg9gbq,e_233809b4" (22 bytes)
 * → 62635f6a756c67396762712c655f3233333830396234 16 00 8021...8021
 *
 * The aggregator's EncodeERC8021Suffix in Go produces byte-identical output.
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

/**
 * Append attribution suffixes to calldata per ERC-8021 multi-code schema.
 *
 * On Base mainnet with embedCode:
 *   Builds ERC-8021 suffix for "bc_julg9gbq,<embedCode>"
 *   → Full schema 0 structure with both codes comma-separated
 *
 * On other chains with embedCode:
 *   Builds ERC-8021 suffix for "<embedCode>" only
 *   → Full schema 0 structure with single code
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
