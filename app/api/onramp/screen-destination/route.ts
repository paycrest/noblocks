import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { isAddress } from "viem";
import { withRateLimit } from "@/app/lib/rate-limit";
import { verifyJWT } from "@/app/lib/jwt";
import { DEFAULT_PRIVY_CONFIG } from "@/app/lib/config";
import config from "@/app/lib/config";
import { aggregatorOriginForV2 } from "@/app/api/aggregator";
import { isSenderPaymentOrderUuid } from "@/app/lib/payment-order-id";
import { screenAddress } from "@/app/lib/scorechain";

/**
 * POST /api/onramp/screen-destination
 *
 * AML gate for onramp chained forwarding. The client calls this once the onramp settles into the
 * user's Noblocks wallet, BEFORE forwarding to the user's chosen destination. Screening runs
 * server-side so the Scorechain API key never reaches the browser. The actual transfer (leg 2) is
 * performed client-side with the same sponsored EIP-7702 flow as a normal Noblocks transfer.
 *
 * To stop a signed-in user from screening arbitrary addresses and burning the shared Scorechain
 * quota, the request must reference a real onramp order (sender payment UUID) that is currently
 * `settled`. (Full per-user order ownership binding needs the durable forwarding record tracked as
 * a follow-up to #547; the aggregator order lookup is scoped by the sender API key.)
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
    orderId?: unknown;
    destination?: unknown;
  };
  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  const destination =
    typeof body.destination === "string" ? body.destination.trim() : "";

  if (!isSenderPaymentOrderUuid(orderId)) {
    return NextResponse.json(
      { status: "error", error: "valid onramp orderId is required" },
      { status: 400 },
    );
  }
  if (!isAddress(destination)) {
    return NextResponse.json(
      { status: "error", error: "valid destination is required" },
      { status: 400 },
    );
  }

  // Bind the screen to a real, settled onramp order.
  if (!config.aggregatorSenderApiKey?.trim()) {
    return NextResponse.json(
      { status: "error", error: "Aggregator sender API key is not configured" },
      { status: 500 },
    );
  }
  try {
    const { data, status } = await axios.get(
      `${aggregatorOriginForV2()}/v2/sender/orders/${encodeURIComponent(orderId)}`,
      {
        headers: { "API-Key": config.aggregatorSenderApiKey.trim() },
        validateStatus: () => true,
      },
    );
    if (status !== 200) {
      return NextResponse.json(
        { status: "error", error: "Onramp order not found" },
        { status: 404 },
      );
    }
    const orderStatus = String(
      (data as { data?: { status?: unknown } })?.data?.status ?? "",
    ).toLowerCase();
    if (orderStatus !== "settled") {
      return NextResponse.json(
        { status: "error", error: "Onramp order is not settled" },
        { status: 409 },
      );
    }
  } catch (err) {
    console.error("[onramp] order verification failed:", err);
    return NextResponse.json(
      { status: "error", error: "Could not verify onramp order" },
      { status: 502 },
    );
  }

  // AML gate (fail-closed).
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
