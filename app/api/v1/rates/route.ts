import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiRequest,
  trackApiResponse,
  trackApiError,
  trackBusinessEvent,
} from "@/app/lib/server-analytics";
import { fetchRate } from "@/app/api/aggregator";

// Route handler for GET requests - Rate fetching
export const GET = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    // Get the wallet address from the header set by the middleware
    const walletAddress = request.headers
      .get("x-wallet-address")
      ?.toLowerCase();

    // Track API request (wallet address is optional for rate fetching)
    trackApiRequest(request, "/api/v1/rates", "GET", {
      wallet_address: walletAddress || "anonymous",
    });

    const searchParams = request.nextUrl.searchParams;
    const token = searchParams.get("token")?.trim();
    const rawAmount = searchParams.get("amount");
    const amount = rawAmount === null ? 1 : Number(rawAmount);
    const currency = searchParams.get("currency")?.trim();
    const providerId = searchParams.get("providerId");
    const network = searchParams.get("network")?.trim();
    const rawSide = searchParams.get("side")?.trim().toLowerCase();
    const side =
      rawSide === "buy" || rawSide === "sell" ? rawSide : ("sell" as const);

    const invalidAmount = Number.isNaN(amount) || amount <= 0;
    if (!token || !currency || invalidAmount) {
      trackApiError(
        request,
        "/api/v1/rates",
        "GET",
        new Error("Missing required parameters"),
        400,
      );
      return NextResponse.json(
        {
          success: false,
          error:
            "token and currency are required; amount must be a positive number",
        },
        { status: 400 },
      );
    }

    if (!network) {
      trackApiError(
        request,
        "/api/v1/rates",
        "GET",
        new Error("network query parameter is required"),
        400,
      );
      return NextResponse.json(
        {
          success: false,
          error: "network is required for rate quotes",
        },
        { status: 400 },
      );
    }

    if (
      rawSide !== undefined &&
      rawSide !== "" &&
      rawSide !== "buy" &&
      rawSide !== "sell"
    ) {
      trackApiError(
        request,
        "/api/v1/rates",
        "GET",
        new Error("Invalid side parameter"),
        400,
      );
      return NextResponse.json(
        {
          success: false,
          error: 'side must be "buy" or "sell" when provided',
        },
        { status: 400 },
      );
    }

    // Call the aggregator service to fetch rate
    const rateData = await fetchRate({
      token,
      amount,
      currency,
      providerId: providerId || undefined,
      network,
      side,
    });

    const response = {
      success: true,
      data: {
        token,
        amount,
        currency,
        providerId,
        network,
        side,
        rate: rateData.data,
        fetchedAt: new Date().toISOString(),
      },
    };

    // Track successful API response
    const responseTime = Date.now() - startTime;
    trackApiResponse("/api/v1/rates", "GET", 200, responseTime, {
      wallet_address: walletAddress || "anonymous",
      token,
      amount,
      currency,
      provider_id: providerId,
      network,
      side,
      rate: rateData.data,
    });

    // Track business event
    trackBusinessEvent("Rate Fetched via API", {
      wallet_address: walletAddress || "anonymous",
      token,
      amount,
      currency,
      provider_id: providerId,
      network,
      side,
      rate: rateData.data,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching rate:", error);

    // Track API error
    const responseTime = Date.now() - startTime;
    trackApiError(request, "/api/v1/rates", "GET", error as Error, 500, {
      response_time_ms: responseTime,
    });

    return NextResponse.json(
      { success: false, error: "Rate fetching failed" },
      { status: 500 },
    );
  }
});
