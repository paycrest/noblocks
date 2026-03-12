import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiRequest,
  trackApiResponse,
  trackApiError,
} from "@/app/lib/server-analytics";
import config from "@/app/lib/config";

// Route handler for POST - validate order (user confirmed payment received)
export const POST = withRateLimit(
  async (
    request: NextRequest,
    context: { params: Promise<{ id: string }> },
  ) => {
    const startTime = Date.now();

    try {
      const walletAddress = request.headers
        .get("x-wallet-address")
        ?.toLowerCase();

      if (!walletAddress) {
        trackApiError(
          request,
          "/api/v1/orders/validate",
          "POST",
          new Error("Unauthorized"),
          401,
        );
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 },
        );
      }

      const { id: orderId } = await context.params;
      if (!orderId) {
        trackApiError(
          request,
          "/api/v1/orders/validate",
          "POST",
          new Error("Order ID is required"),
          400,
        );
        return NextResponse.json(
          { success: false, error: "Order ID is required" },
          { status: 400 },
        );
      }

      const fullPath = `/api/v1/orders/${orderId}/validate`;
      trackApiRequest(request, fullPath, "POST", {
        wallet_address: walletAddress,
        order_id: orderId,
      });

      const aggregatorUrl = config.aggregatorUrl?.trim();
      const apiKeyId = config.aggregatorSenderApiKeyId?.trim();
      if (!aggregatorUrl || !apiKeyId) {
        trackApiError(
          request,
          fullPath,
          "POST",
          new Error("Order validate service is not configured"),
          503,
        );
        return NextResponse.json(
          {
            success: false,
            error:
              "Order validate service is not configured. Please try again later.",
          },
          { status: 503 },
        );
      }

      const url = `${aggregatorUrl}/sender/orders/${orderId}/validate`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "API-Key": apiKeyId,
        },
        body: JSON.stringify({}),
      });

      const data = await res.json().catch(() => ({}));
      const message =
        typeof data?.message === "string"
          ? data.message
          : (data?.Message as string) ?? "Unknown error";

      if (!res.ok) {
        const status =
          res.status >= 400 && res.status < 600 ? res.status : 502;
        trackApiError(
          request,
          fullPath,
          "POST",
          new Error(message || "Failed to validate order"),
          status,
          { response_time_ms: Date.now() - startTime },
        );
        return NextResponse.json(
          {
            success: false,
            error: message || "Failed to validate order",
          },
          { status },
        );
      }

      const responseTime = Date.now() - startTime;
      trackApiResponse(fullPath, "POST", 200, responseTime, {
        wallet_address: walletAddress,
        order_id: orderId,
      });

      return NextResponse.json({
        success: true,
        data: {
          message: message || "Order validated successfully",
          validatedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Validate order error:", error);
      const responseTime = Date.now() - startTime;
      const orderId = (await context.params).id;
      const fullPath = `/api/v1/orders/${orderId}/validate`;
      trackApiError(request, fullPath, "POST", error as Error, 500, {
        response_time_ms: responseTime,
      });
      return NextResponse.json(
        {
          success: false,
          error: "Failed to validate order. Please try again.",
        },
        { status: 500 },
      );
    }
  },
);
