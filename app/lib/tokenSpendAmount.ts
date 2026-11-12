import { parseUnits } from "viem";
import type { Token } from "@/app/types";

/**
 * Compare token `address` from the list to the form value.
 * EVM (0x…) is compared case-insensitively; other chains (e.g. Tron base58) stay case-sensitive.
 */
export function addressesMatchTokenRow(
  rowAddress: string | undefined | null,
  key: string | undefined | null,
): boolean {
  if (key == null || typeof key !== "string") return false;
  const k = key.trim();
  if (!k) return false;
  const row = rowAddress?.trim() ?? "";
  if (!row) return false;
  const kHex = /^0x/i.test(k);
  const rowHex = /^0x/i.test(row);
  if (kHex && rowHex) {
    return row.toLowerCase() === k.toLowerCase();
  }
  return row === k;
}

/** Largest decimals field allowed on standard EVM ERC-20 metadata (uint8). */
export const MAX_SUPPORTED_TOKEN_DECIMALS = 255;

/** Decimals from our token list: must be a positive integer (no defaulting). */
export function isValidTokenDecimals(d: unknown): d is number {
  return (
    typeof d === "number" &&
    Number.isInteger(d) &&
    d > 0 &&
    d <= MAX_SUPPORTED_TOKEN_DECIMALS
  );
}

const TOKEN_DECIMALS_DIGITS_ONLY = /^\d+$/;

/**
 * Coerce aggregator decimals once at the token-list boundary.
 * Only finite numbers or non-empty digit-only strings (after trim) are accepted.
 * 0, NaN, non-integers, and other types stay invalid; isValidTokenDecimals fails closed.
 * Do not default to 18.
 */
export function normalizeTokenDecimals(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : NaN;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || !TOKEN_DECIMALS_DIGITS_ONLY.test(trimmed)) {
      return NaN;
    }
    return Number(trimmed);
  }
  return NaN;
}

export type SpendTokenResolution =
  | { ok: true; address: string; decimals: number }
  | { ok: false; reason: string };

/**
 * Resolve spend token for gateway / preview by **network token list + address only**.
 * Does not fall back to symbol-only matching.
 */
export function resolveSpendTokenFromList(params: {
  tokens: Token[];
  tokenAddress?: string;
}): SpendTokenResolution {
  const key = params.tokenAddress?.trim() ?? "";
  if (!key) {
    return { ok: false, reason: "missing_token_address" };
  }
  const t = params.tokens.find((x) => addressesMatchTokenRow(x.address, key));
  if (!t) {
    return { ok: false, reason: "no_matching_token" };
  }
  if (!isValidTokenDecimals(t.decimals)) {
    return { ok: false, reason: "invalid_decimals" };
  }
  return { ok: true, address: t.address.trim(), decimals: t.decimals };
}

/**
 * Bridge / leg builder: require a usable contract id and decimals from the token row.
 * Native tokens use `isNative` and empty `address` (same as LI.FI zero-address convention).
 */
export function resolveBridgeLegToken(
  token: Token,
):
  | { ok: true; address: string; decimals: number }
  | { ok: false; reason: string } {
  if (!isValidTokenDecimals(token.decimals)) {
    return { ok: false, reason: "invalid_decimals" };
  }
  if (token.isNative && (token.address === "" || token.address == null)) {
    return { ok: true, address: "", decimals: token.decimals };
  }
  const addr = token.address?.trim() ?? "";
  if (!addr) {
    return { ok: false, reason: "missing_token_address" };
  }
  return { ok: true, address: addr, decimals: token.decimals };
}

/** Bridge pickers: only rows that resolve to a usable leg address and decimals. */
export function isBridgeLegTokenSelectable(token: Token): boolean {
  return resolveBridgeLegToken(token).ok;
}

/** Single row from the network list: native matches empty address; otherwise match normalized contract id. */
export function findTokenInNetworkList(
  supportedTokens: Token[],
  tokenAddress: string,
): Token | undefined {
  const key = tokenAddress.trim();
  if (key === "") {
    return supportedTokens.find(
      (t) =>
        Boolean(t.isNative) &&
        (t.address == null || String(t.address).trim() === ""),
    );
  }
  return supportedTokens.find((t) => addressesMatchTokenRow(t.address, key));
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Shared guard for injected and embedded bridge execute paths.
 * An empty or zero address is native only when the network-list row is native
 * and the symbol matches. Otherwise fail closed.
 */
export function resolveBridgeExecuteToken(
  supportedTokens: Token[],
  tokenAddress: string,
  tokenSymbol: string,
):
  | { ok: true; address: string; decimals: number }
  | { ok: false; message: string } {
  const key =
    !tokenAddress.trim() ||
    tokenAddress.trim().toLowerCase() === ZERO_ADDRESS
      ? ""
      : tokenAddress;
  const tokenRow = findTokenInNetworkList(supportedTokens, key);
  if (!tokenRow) {
    return {
      ok: false,
      message: "Token data not found for the selected asset.",
    };
  }
  if (
    key === "" &&
    (!tokenRow.isNative ||
      tokenRow.symbol.toUpperCase() !== tokenSymbol.toUpperCase())
  ) {
    return {
      ok: false,
      message: "Token contract address is missing for the selected asset.",
    };
  }
  const resolved = resolveBridgeLegToken(tokenRow);
  if (!resolved.ok) {
    return {
      ok: false,
      message: "Token data not found for the selected asset.",
    };
  }
  return resolved;
}

/**
 * Expand Number.prototype.toString scientific notation (e.g. "1e-25", "1e+21")
 * into a plain decimal string without rounding. `toLocaleString` with a capped
 * maximumFractionDigits rounds values smaller than 1e-24 to "0", which then
 * slips past the fraction-digit guard as zero base units.
 */
function expandScientificNotation(raw: string): string {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/i.exec(raw);
  if (!match) return "";
  const sign = match[1] === "-" ? "-" : "";
  const intPart = match[2];
  const fracPart = match[3] ?? "";
  const exp = Number(match[4]);
  const digits = intPart + fracPart;
  const pointIndex = intPart.length + exp;
  if (pointIndex <= 0) {
    return `${sign}0.${"0".repeat(-pointIndex)}${digits}`;
  }
  if (pointIndex >= digits.length) {
    return `${sign}${digits}${"0".repeat(pointIndex - digits.length)}`;
  }
  return `${sign}${digits.slice(0, pointIndex)}.${digits.slice(pointIndex)}`;
}

/**
 * Stable decimal string for `parseUnits` — expands scientific notation without rounding.
 */
export function amountSentToDecimalString(amountSent: number): string {
  if (!Number.isFinite(amountSent)) return "";
  const raw = amountSent.toString();
  if (!/[eE]/.test(raw)) return raw;
  return expandScientificNotation(raw);
}

/** Reject amounts with more fractional digits than the token allows (fail closed — no silent rounding). */
export function assertFractionWithinDecimals(
  amountStr: string,
  decimals: number,
): void {
  const trimmed = amountStr.trim();
  const dot = trimmed.indexOf(".");
  if (dot < 0) return;
  const frac = trimmed.slice(dot + 1).replace(/0+$/, "");
  if (frac.length > decimals) {
    throw new Error(
      "Fractional amount exceeds the token's decimal precision.",
    );
  }
}

export type OfframpSpendBuild =
  | { ok: true; wei: bigint; decimals: number }
  | { ok: false; error: string };

/**
 * Convert a human-readable amount to base units for the given decimals (viem `parseUnits` string in).
 * Fails closed: invalid decimals or malformed fractional input throw (no silent `"0"`).
 */
export function toRawAmount(amount: string, decimals: number): string {
  if (!isValidTokenDecimals(decimals)) {
    throw new Error("Token decimals missing or invalid for this network.");
  }
  try {
    assertFractionWithinDecimals(amount, decimals);
    return parseUnits(amount, decimals).toString();
  } catch {
    throw new Error("Amount is invalid or has too many decimals for this token.");
  }
}

/**
 * Exact base units for an off-ramp spend using the token list's real decimals (viem `parseUnits`).
 * Fails closed on bad resolution, invalid amount string, or excess fractional digits.
 */
/**
 * Convert a UI amount (`number` or decimal `string`) to base units using real decimals.
 * Same fail-closed rules as `toRawAmount` (fraction guard + viem parseUnits).
 */
export function amountNumberToBaseUnits(
  amount: number | string,
  decimals: number,
): bigint {
  if (!isValidTokenDecimals(decimals)) {
    throw new Error("Token decimals missing or invalid for this network.");
  }
  if (typeof amount === "string") {
    const trimmed = amount.trim();
    if (!trimmed) {
      throw new Error("Invalid amount.");
    }
    assertFractionWithinDecimals(trimmed, decimals);
    try {
      return parseUnits(trimmed as `${string}`, decimals);
    } catch {
      throw new Error(
        "Amount is invalid or has too many decimals for this token.",
      );
    }
  }
  if (!Number.isFinite(amount)) {
    throw new Error("Invalid amount.");
  }
  const str = amountSentToDecimalString(amount);
  if (str === "") {
    throw new Error("Invalid amount.");
  }
  assertFractionWithinDecimals(str, decimals);
  try {
    return parseUnits(str as `${string}`, decimals);
  } catch {
    throw new Error(
      "Amount is invalid or has too many decimals for this token.",
    );
  }
}

export function buildOfframpSpendWei(
  amountSent: number | string,
  resolution: SpendTokenResolution,
): OfframpSpendBuild {
  if (!resolution.ok) {
    return { ok: false, error: "Token is not configured for this network." };
  }
  const str =
    typeof amountSent === "string"
      ? amountSent.trim()
      : amountSentToDecimalString(amountSent);
  if (str === "") {
    return { ok: false, error: "Invalid amount." };
  }
  try {
    assertFractionWithinDecimals(str, resolution.decimals);
    const wei = parseUnits(str as `${string}`, resolution.decimals);
    return { ok: true, wei, decimals: resolution.decimals };
  } catch {
    return {
      ok: false,
      error:
        "Amount has too many decimal places for this token, or is not a valid number.",
    };
  }
}
