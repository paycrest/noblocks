import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { withRateLimit } from "@/app/lib/rate-limit";
import { verifyJWT } from "@/app/lib/jwt";
import { DEFAULT_PRIVY_CONFIG } from "@/app/lib/config";
import config from "@/app/lib/config";
import { screenAddress } from "@/app/lib/scorechain";

/**
 * POST /api/onramp/screen-destination
 *
 * AML gate for onramp chained forwarding. The client calls this once the onramp settles into the
 * user's Noblocks wallet, BEFORE forwarding to the user's chosen destination. Screening runs
 * server-side so the Scorechain API key never reaches the browser. The actual transfer (leg 2) is
 * performed client-side with the same sponsored EIP-7702 flow as a normal Noblocks transfer.
 *
 * FAIL-CLOSED: any screening failure (or a sanctioned hit) returns a non-"clear" status, and the
 * client must NOT forward — it surfaces a "under review — contact support" notice instead.
 *
 * Responses: { status: "clear" | "flagged" | "held_review" | "disabled" }
 */
export const POST = withRateLimit(async (request: NextRequest) => {
  if (!config.onrampChainedForwardingEnabled) {
    return NextResponse.json(
      { status: "disabled", error: "Onramp chained forwarding is disabled" },
      { status: 404 },
    );
  }

  // Auth: require a valid Privy JWT so this isn't an open screening endpoint.
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { status: "error", error: "Missing or invalid authorization header" },
      { status: 401 },
    );
  }
  try {
    const { payload } = await verifyJWT(authHeader.substring(7), DEFAULT_PRIVY_CONFIG);
    if (!(payload.sub || payload.userId)) throw new Error("No subject in token");
  } catch {
    return NextResponse.json(
      { status: "error", error: "Unauthorized" },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    destination?: unknown;
  };
  const destination =
    typeof body.destination === "string" ? body.destination.trim() : "";
  if (!isAddress(destination)) {
    return NextResponse.json(
      { status: "error", error: "valid destination is required" },
      { status: 400 },
    );
  }

  try {
    const screen = await screenAddress(destination);
    if (screen.isSanctioned) {
      console.warn(
        `[onramp] destination flagged by Scorechain: ${destination}`,
      );
      return NextResponse.json({ status: "flagged", details: screen.details ?? null });
    }
    return NextResponse.json({ status: "clear" });
  } catch (err) {
    console.error("[onramp] screening failed (fail-closed):", err);
    return NextResponse.json({ status: "held_review", reason: "screening_unavailable" });
  }
});
