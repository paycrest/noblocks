import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiRequest,
  trackApiResponse,
  trackApiError,
} from "@/app/lib/server-analytics";
import config from "@/app/lib/config";

export const GET = withRateLimit(
  async (
    request: NextRequest,
    { params }: { params: { id: string } },
  ) => {
    const startTime = Date.now();

    try {
      const walletAddress = request.headers.get("x-wallet-address")?.toLowerCase();

      if (!walletAddress) {
        trackApiError(request, "/api/v1/payment-orders/[id]", "GET", new Error("Unauthorized"), 401);
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      }

      const { id } = await params;
      if (!id) {
        trackApiError(request, "/api/v1/payment-orders/[id]", "GET", new Error("Missing order id"), 400);
        return NextResponse.json({ success: false, error: "Missing order id" }, { status: 400 });
      }

      trackApiRequest(request, "/api/v1/payment-orders/[id]", "GET", {
        wallet_address: walletAddress,
        order_id: id,
      });

      if (!config.aggregatorUrl) {
        trackApiError(request, "/api/v1/payment-orders/[id]", "GET", new Error("NEXT_PUBLIC_AGGREGATOR_URL is not configured"), 500);
        return NextResponse.json(
          { success: false, error: "NEXT_PUBLIC_AGGREGATOR_URL is not configured" },
          { status: 500 },
        );
      }

      if (!config.aggregatorSenderApiKey?.trim()) {
        trackApiError(
          request,
          "/api/v1/payment-orders/[id]",
          "GET",
          new Error("AGGREGATOR_SENDER_API_KEY_ID is not configured"),
          500,
        );
        return NextResponse.json(
          { success: false, error: "AGGREGATOR_SENDER_API_KEY_ID is not configured" },
          { status: 500 },
        );
      }

      const baseUrl = config.aggregatorUrl.replace(/\/+$/, "").replace(/\/v1$/i, "");
      const url = `${baseUrl}/v2/sender/orders/${encodeURIComponent(id)}`;

      const { data, status } = await axios.get(url, {
        headers: {
          "API-Key": config.aggregatorSenderApiKey.trim(),
        },
        validateStatus: () => true,
      });

      const responseTime = Date.now() - startTime;
      trackApiResponse("/api/v1/payment-orders/[id]", "GET", status, responseTime, {
        wallet_address: walletAddress,
        order_id: id,
      });

      const msg =
        data && typeof data === "object" && "message" in data && typeof (data as { message: unknown }).message === "string"
          ? (data as { message: string }).message
          : "";
      if (status === 404 && /api key not found/i.test(msg)) {
        return NextResponse.json(data, { status: 401 });
      }

      return NextResponse.json(data, { status });
    } catch (error) {
      console.error("Error fetching payment order:", error);

      const responseTime = Date.now() - startTime;
      trackApiError(request, "/api/v1/payment-orders/[id]", "GET", error as Error, 500, {
        response_time_ms: responseTime,
      });

      return NextResponse.json(
        { success: false, error: "Internal server error" },
        { status: 500 },
      );
    }
  },
);
