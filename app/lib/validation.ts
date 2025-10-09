/**
 * Validation utilities
 */

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
 * @returns true if valid EVM address format
 */
export function isValidEvmAddressCaseInsensitive(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
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

