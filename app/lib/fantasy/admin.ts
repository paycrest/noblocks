import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import { jsonError } from "./server";

/**
 * Admin auth for /api/play/admin/* (F-15): the request must carry an
 * x-admin-key header exactly matching the FANTASY_ADMIN_KEY env var, and that
 * env must be set and non-empty — an unset key means admin tooling is OFF,
 * never open. Admin routes self-authenticate: neither the middleware matcher
 * nor the fantasy feature flag applies to them.
 *
 * Returns null when authorized, otherwise the 401 response to return as-is.
 */
export function requireAdmin(request: NextRequest): NextResponse | null {
  const expected = process.env.FANTASY_ADMIN_KEY;
  if (!expected) return jsonError("Unauthorized", 401);
  const provided = request.headers.get("x-admin-key");
  if (provided !== expected) return jsonError("Unauthorized", 401);
  return null;
}
