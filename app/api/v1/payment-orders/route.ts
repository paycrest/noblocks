import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiRequest,
  trackApiResponse,
  trackApiError,
} from "@/app/lib/server-analytics";
import config from "@/app/lib/config";

export const POST = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    const walletAddress = request.headers.get("x-wallet-address")?.toLowerCase();

    if (!walletAddress) {
      trackApiError(request, "/api/v1/payment-orders", "POST", new Error("Unauthorized"), 401);
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    trackApiRequest(request, "/api/v1/payment-orders", "POST", { wallet_address: walletAddress });

    if (!config.aggregatorUrl) {
      trackApiError(request, "/api/v1/payment-orders", "POST", new Error("NEXT_PUBLIC_AGGREGATOR_URL is not configured"), 500);
      return NextResponse.json(
        { success: false, error: "NEXT_PUBLIC_AGGREGATOR_URL is not configured" },
        { status: 500 },
      );
    }

    if (!config.aggregatorSenderApiKey?.trim()) {
      trackApiError(
        request,
        "/api/v1/payment-orders",
        "POST",
        new Error("NEXT_PUBLIC_AGGREGATOR_SENDER_API_KEY_ID is not configured"),
        500,
      );
      return NextResponse.json(
        { success: false, error: "NEXT_PUBLIC_AGGREGATOR_SENDER_API_KEY_ID is not configured" },
        { status: 500 },
      );
    }

    const body = await request.json();

    // On-ramp (fiat source) only: off-ramp orders are created on-chain via gateway.createOrder, not via this proxy.
    const sourceType = (body as { source?: { type?: string } })?.source?.type;
    if (sourceType !== "fiat") {
      trackApiError(
        request,
        "/api/v1/payment-orders",
        "POST",
        new Error("Off-ramp payment orders are not created through this endpoint"),
        400,
      );
      return NextResponse.json(
        {
          success: false,
          error:
            "Only on-ramp (fiat source) orders are supported. Off-ramp uses on-chain gateway.createOrder.",
        },
        { status: 400 },
      );
    }

    const baseUrl = config.aggregatorUrl.replace(/\/+$/, "").replace(/\/v1$/i, "");
    const url = `${baseUrl}/v2/sender/orders`;

    if (process.env.NODE_ENV === "development") {
      console.log("[payment-orders] onramp→v2 url →", url);
      console.log("[payment-orders] POST payload →", JSON.stringify(body, null, 2));
    }

    const { data, status } = await axios.post(url, body, {
      headers: {  
        "Content-Type": "application/json",
        "API-Key": config.aggregatorSenderApiKey.trim(),
      },
      validateStatus: () => true,
    });

    const responseTime = Date.now() - startTime;
    trackApiResponse("/api/v1/payment-orders", "POST", status, responseTime, {
      wallet_address: walletAddress,
    });

    // Aggregator returns 404 for unknown API keys; use 401 so clients don't treat it as "route not found".
    const msg =
      data && typeof data === "object" && "message" in data && typeof (data as { message: unknown }).message === "string"
        ? (data as { message: string }).message
        : "";
    if (status === 404 && /api key not found/i.test(msg)) {
      return NextResponse.json(data, { status: 401 });
    }

    return NextResponse.json(data, { status });
  } catch (error) {
    console.error("Error creating payment order:", error);

    const responseTime = Date.now() - startTime;
    trackApiError(request, "/api/v1/payment-orders", "POST", error as Error, 500, {
      response_time_ms: responseTime,
    });

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
});
