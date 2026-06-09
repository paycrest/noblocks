import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiRequest,
  trackApiResponse,
  trackApiError,
} from "@/app/lib/server-analytics";
import config from "@/app/lib/config";
import { aggregatorOriginForV2 } from "@/app/api/aggregator";
import {
  isGatewayOrderId,
  isSenderPaymentOrderUuid,
  resolveChainIdFromNetworkName,
} from "@/app/lib/payment-order-id";

export const GET = withRateLimit(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
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

      const orderId = id.trim();
      const networkParam = request.nextUrl.searchParams.get("network")?.trim() ?? "";

      trackApiRequest(request, "/api/v1/payment-orders/[id]", "GET", {
        wallet_address: walletAddress,
        order_id: orderId,
        gateway_lookup: isGatewayOrderId(orderId),
      });

      if (!config.aggregatorUrl) {
        trackApiError(request, "/api/v1/payment-orders/[id]", "GET", new Error("NEXT_PUBLIC_AGGREGATOR_URL is not configured"), 500);
        return NextResponse.json(
          { success: false, error: "NEXT_PUBLIC_AGGREGATOR_URL is not configured" },
          { status: 500 },
        );
      }

      const base = aggregatorOriginForV2();
      let url: string;
      let headers: Record<string, string> = {};

      if (isGatewayOrderId(orderId)) {
        if (!networkParam) {
          return NextResponse.json(
            {
              status: "error",
              message:
                "Query parameter `network` is required for offramp gateway order lookup",
            },
            { status: 400 },
          );
        }
        const chainId = resolveChainIdFromNetworkName(networkParam);
        if (chainId == null) {
          return NextResponse.json(
            {
              status: "error",
              message: `Unknown network: ${networkParam}`,
            },
            { status: 400 },
          );
        }
        url = `${base}/v2/orders/${chainId}/${encodeURIComponent(orderId)}`;
      } else if (isSenderPaymentOrderUuid(orderId)) {
        if (!config.aggregatorSenderApiKey?.trim()) {
          trackApiError(
            request,
            "/api/v1/payment-orders/[id]",
            "GET",
            new Error("NEXT_PUBLIC_AGGREGATOR_SENDER_API_KEY_ID is not configured"),
            500,
          );
          return NextResponse.json(
            { success: false, error: "NEXT_PUBLIC_AGGREGATOR_SENDER_API_KEY_ID is not configured" },
            { status: 500 },
          );
        }
        url = `${base}/v2/sender/orders/${encodeURIComponent(orderId)}`;
        headers = { "API-Key": config.aggregatorSenderApiKey.trim() };
      } else {
        return NextResponse.json(
          {
            status: "error",
            message:
              "Invalid order id: expected a sender payment order UUID (onramp) or gateway order id (0x + 64 hex, offramp)",
          },
          { status: 400 },
        );
      }

      const { data, status } = await axios.get(url, {
        headers,
        validateStatus: () => true,
      });

      const responseTime = Date.now() - startTime;
      trackApiResponse("/api/v1/payment-orders/[id]", "GET", status, responseTime, {
        wallet_address: walletAddress,
        order_id: orderId,
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
