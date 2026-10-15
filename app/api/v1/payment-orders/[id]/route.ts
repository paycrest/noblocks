import { NextRequest } from "next/server";
import axios from "axios";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiRequest,
  trackApiResponse,
  trackApiError,
} from "@/app/lib/server-analytics";
import config from "@/app/lib/config";
import { getAggregatorSenderApiKey } from "@/app/lib/server-config";
import { aggregatorOriginForV2 } from "@/app/api/aggregator";
import {
  isGatewayOrderId,
  isStarknetOrderId,
  isSenderPaymentOrderUuid,
  resolveChainIdFromNetworkName,
} from "@/app/lib/payment-order-id";
import { assertCallerOwnsSenderOrder } from "@/app/lib/transaction-wallet-auth";
import { buildAggregatorOutboundHeaders } from "@/app/lib/aggregator-outbound-headers";
import {
  paymentOrdersJson,
  tracePaymentOrdersProxy,
} from "@/app/lib/payment-orders-tracing";

export const GET = withRateLimit(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) =>
    tracePaymentOrdersProxy("get", {}, async (span) => {
    const startTime = Date.now();

    try {
      const walletAddress = request.headers.get("x-wallet-address")?.toLowerCase();

      if (!walletAddress) {
        trackApiError(request, "/api/v1/payment-orders/[id]", "GET", new Error("Unauthorized"), 401);
        return paymentOrdersJson(span, { success: false, error: "Unauthorized" }, 401);
      }

      const { id } = await params;
      if (!id) {
        trackApiError(request, "/api/v1/payment-orders/[id]", "GET", new Error("Missing order id"), 400);
        return paymentOrdersJson(span, { success: false, error: "Missing order id" }, 400);
      }

      const orderId = id.trim();
      const networkParam = request.nextUrl.searchParams.get("network")?.trim() ?? "";

      trackApiRequest(request, "/api/v1/payment-orders/[id]", "GET", {
        wallet_address: walletAddress,
        order_id: orderId,
        gateway_lookup: isGatewayOrderId(orderId) || (isStarknetOrderId(orderId) && networkParam === "Starknet"),
      });

      if (!config.aggregatorUrl) {
        trackApiError(request, "/api/v1/payment-orders/[id]", "GET", new Error("NEXT_PUBLIC_AGGREGATOR_URL is not configured"), 500);
        return paymentOrdersJson(
          span,
          { success: false, error: "NEXT_PUBLIC_AGGREGATOR_URL is not configured" },
          500,
        );
      }

      const base = aggregatorOriginForV2();
      let url: string;
      let headers: Record<string, string> = {};

      const isGateway =
        isGatewayOrderId(orderId) ||
        (isStarknetOrderId(orderId) && networkParam === "Starknet");
      span?.setTag("lookup_type", isGateway ? "gateway" : "sender");

      if (isGateway) {
        if (!networkParam) {
          return paymentOrdersJson(
            span,
            {
              status: "error",
              message:
                "Query parameter `network` is required for offramp gateway order lookup",
            },
            400,
          );
        }
        const chainId = resolveChainIdFromNetworkName(networkParam);
        if (chainId == null) {
          return paymentOrdersJson(
            span,
            {
              status: "error",
              message: `Unknown network: ${networkParam}`,
            },
            400,
          );
        }
        url = `${base}/v2/orders/${chainId}/${encodeURIComponent(orderId)}`;
      } else if (isSenderPaymentOrderUuid(orderId)) {
        const senderApiKey = getAggregatorSenderApiKey();
        if (!senderApiKey) {
          trackApiError(
            request,
            "/api/v1/payment-orders/[id]",
            "GET",
            new Error("AGGREGATOR_SENDER_API_KEY_ID is not configured"),
            500,
          );
          return paymentOrdersJson(
            span,
            { success: false, error: "AGGREGATOR_SENDER_API_KEY_ID is not configured" },
            500,
          );
        }
        const owner = await assertCallerOwnsSenderOrder(request, orderId, walletAddress);
        if (!owner.ok) {
          trackApiError(request, "/api/v1/payment-orders/[id]", "GET", new Error(owner.error), owner.status);
          return paymentOrdersJson(
            span,
            { status: "error", message: owner.error },
            owner.status,
          );
        }
        url = `${base}/v2/sender/orders/${encodeURIComponent(orderId)}`;
        headers = { "API-Key": senderApiKey };
      } else {
        return paymentOrdersJson(
          span,
          {
            status: "error",
            message:
              "Invalid order id: expected a sender payment order UUID or a gateway order id (0x + 64 hex)",
          },
          400,
        );
      }

      const { data, status } = await axios.get(url, {
        headers: await buildAggregatorOutboundHeaders(headers, request.headers),
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
        return paymentOrdersJson(span, data, 401);
      }

      return paymentOrdersJson(span, data, status);
    } catch (error) {
      console.error("Error fetching payment order:", error);

      const responseTime = Date.now() - startTime;
      trackApiError(request, "/api/v1/payment-orders/[id]", "GET", error as Error, 500, {
        response_time_ms: responseTime,
      });

      return paymentOrdersJson(
        span,
        { success: false, error: "Internal server error" },
        500,
      );
    }
    }),
);
