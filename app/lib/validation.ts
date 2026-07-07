/**
 * Validation utilities
 */

/**
 * Validates Tron address format (base58, starts with T).
 */
export function isValidTronAddress(address: string): boolean {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address.trim());
}

/**
 * Validates Ethereum/EVM address format
 * @param address - The address to validate (should be lowercased for strict validation)
 * @returns true if valid EVM address format
 */
export function isValidEvmAddress(address: string): boolean {
  return /^0x[a-f0-9]{40}$/.test(address);
}

/**
 * Validates Ethereum/EVM address format (case-insensitive)
 * @param address - The address to validate
 * @returns true if valid EVM address format (0x + 40 hex digits)
 */
export function isValidEvmAddressCaseInsensitive(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validates Starknet address format (0x + 1–64 hex digits, not zero address).
 * Matches rules used by {@link normalizeStarknetAddress} in `utils.ts`.
 */
export function isValidStarknetAddress(address: string): boolean {
  const trimmed = address.trim();
  if (!trimmed.startsWith("0x")) return false;
  const hexPart = trimmed.slice(2);
  if (!/^[a-fA-F0-9]+$/.test(hexPart)) return false;
  if (hexPart.length === 0 || hexPart.length > 64) return false;
  if (/^0+$/.test(hexPart)) return false;
  return true;
}

/**
 * Network-aware wallet address check for on-ramp recipient fields.
 * @returns `true` if valid, or an error message for react-hook-form.
 */
export function validateWalletAddress(
  value: string | undefined,
  networkName: string,
): true | string {
  const raw = (value ?? "").trim();
  if (!raw) return true;
  if (networkName === "Tron") {
    if (raw.startsWith("0x")) {
      return "This address is an EVM address. Enter a Tron address.";
    }
    if (!isValidTronAddress(raw)) {
      return "Enter a valid Tron address.";
    }
    return true;
  }
  if (!raw.startsWith("0x")) return "Address must start with 0x";
  if (networkName === "Starknet") {
    if (isValidEvmAddressCaseInsensitive(raw)) {
      return "This address is an EVM address. Enter a Starknet address.";
    }
    if (!isValidStarknetAddress(raw)) {
      return "Enter a valid Starknet address.";
    }
    return true;
  }
  if (!isValidEvmAddressCaseInsensitive(raw)) {
    return "Invalid wallet address format";
  }
  return true;
}

/**
 * Validates email format
 * @param email - The email to validate
 * @returns true if valid email format
 */
export function isValidEmail(email: string): boolean {
  // Basic RFC 5322 compliant regex
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validates email with length check (RFC 5321: 320 chars max)
 * @param email - The email to validate
 * @returns true if valid format and within length
 */
export function isValidEmailWithLength(email: string): boolean {
  return email.length <= 320 && isValidEmail(email);
}
