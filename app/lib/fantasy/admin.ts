import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { jsonError } from "./server";

const sha256 = (value: string) => createHash("sha256").update(value).digest();

/**
 * Admin auth for /api/play/admin/* (F-15): the request must carry an
 * x-admin-key header exactly matching the FANTASY_ADMIN_KEY env var, and that
 * env must be set and non-empty — an unset key means admin tooling is OFF,
 * never open. Admin routes self-authenticate: neither the middleware matcher
 * nor the fantasy feature flag applies to them.
 *
 * Comparison is constant-time over fixed-length digests, so neither the key's
 * length nor a matching prefix leaks through response timing.
 *
 * Returns null when authorized, otherwise the 401 response to return as-is.
 */
export function requireAdmin(request: NextRequest): NextResponse | null {
  const expected = process.env.FANTASY_ADMIN_KEY;
  if (!expected) return jsonError("Unauthorized", 401);
  const provided = request.headers.get("x-admin-key") ?? "";
  if (!timingSafeEqual(sha256(provided), sha256(expected))) {
    return jsonError("Unauthorized", 401);
  }
  return null;
}

/**
 * CSV field escape for admin payout exports, hardened against spreadsheet
 * formula injection: ops opens these files in Excel/Sheets, so a free-text
 * value (challenge titles especially) starting with = + - @ or tab/CR must
 * never execute as a formula. Plain numbers (e.g. negative points) are left
 * untouched; anything else with a formula trigger is prefixed with a quote.
 */
export const csvEscape = (value: unknown): string => {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) {
    s = `'${s}`;
  }
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
