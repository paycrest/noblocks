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

/** Decimals from our token list: must be a positive integer (no defaulting). */
export function isValidTokenDecimals(d: unknown): d is number {
  return typeof d === "number" && Number.isInteger(d) && d > 0;
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

const OFFRAMP_AMOUNT_STRING_MAX_DECIMALS = 24;

/**
 * Stable decimal string for `parseUnits` — avoids scientific notation from Number for typical UI amounts.
 */
export function amountSentToDecimalString(amountSent: number): string {
  if (!Number.isFinite(amountSent)) return "";
  const raw = amountSent.toString();
  if (!/[eE]/.test(raw)) return raw;
  return amountSent.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: OFFRAMP_AMOUNT_STRING_MAX_DECIMALS,
  });
}

/** Reject amounts with more fractional digits than the token allows (fail closed — no silent rounding). */
export function assertFractionWithinDecimals(
  amountStr: string,
  decimals: number,
): void {
  const trimmed = amountStr.trim();
  const dot = trimmed.indexOf(".");
  if (dot < 0) return;
  const frac = trimmed.slice(dot + 1);
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
 * Convert a numeric UI amount to base-unit string using real decimals: stable string + fraction guard + viem parseUnits.
 * Use for transfers where the input is a `number` (same fail-closed rules as `toRawAmount`).
 */
export function amountNumberToBaseUnits(
  amount: number,
  decimals: number,
): string {
  if (!isValidTokenDecimals(decimals)) {
    throw new Error("Token decimals missing or invalid for this network.");
  }
  const str = amountSentToDecimalString(amount);
  if (str === "") {
    throw new Error("Invalid amount.");
  }
  assertFractionWithinDecimals(str, decimals);
  try {
    return parseUnits(str as `${string}`, decimals).toString();
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
