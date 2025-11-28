import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
    trackServerEvent,
    trackTransactionEvent,
    trackFundingEvent,
    trackAuthEvent,
    trackBusinessEvent,
    trackApiRequest,
    trackApiResponse,
    trackApiError,
} from "@/app/lib/server-analytics";

/**
 * Server-side event tracking API endpoint
 * Accepts events from client and tracks them server-side for reliability
 * Falls back to body walletAddress if not available in auth context
 */
export const POST = withRateLimit(async (request: NextRequest) => {
    const startTime = Date.now();

    try {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") {
            // Don't track errors for invalid JSON bodies - likely bots or malformed requests
            // Just return 400 without logging to Mixpanel to reduce noise
            return NextResponse.json(
                { success: false, error: "Invalid JSON body" },
                { status: 400 },
            );
        }

        const { eventName, properties = {}, walletAddress: bodyWalletAddress } =
            body as {
                eventName?: string;
                properties?: Record<string, any>;
                walletAddress?: string;
            };

        if (!eventName || typeof eventName !== "string") {
            const response = NextResponse.json(
                { success: false, error: "Missing or invalid eventName" },
                { status: 400 },
            );
            // Track error asynchronously
            Promise.resolve().then(() => {
                try {
                    trackApiError(
                        request,
                        "/api/v1/analytics/track",
                        "POST",
                        new Error("Missing or invalid eventName"),
                        400,
                    );
                } catch (e) { }
            }).catch(() => { });
            return response;
        }

        // Try to get wallet address from auth context (middleware header) first
        // Fall back to body walletAddress if not available
        const walletAddress =
            request.headers.get("x-wallet-address")?.toLowerCase() ||
            (typeof bodyWalletAddress === "string"
                ? bodyWalletAddress.toLowerCase()
                : null);

        if (!walletAddress) {
            const response = NextResponse.json(
                { success: false, error: "Missing wallet address" },
                { status: 400 },
            );
            // Track error asynchronously
            Promise.resolve().then(() => {
                try {
                    trackApiError(
                        request,
                        "/api/v1/analytics/track",
                        "POST",
                        new Error("Missing wallet address"),
                        400,
                    );
                } catch (e) { }
            }).catch(() => { });
            return response;
        }

        // Validate wallet address format
        if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
            const response = NextResponse.json(
                { success: false, error: "Invalid wallet address format" },
                { status: 400 },
            );
            // Track error asynchronously
            Promise.resolve().then(() => {
                try {
                    trackApiError(
                        request,
                        "/api/v1/analytics/track",
                        "POST",
                        new Error("Invalid wallet address format"),
                        400,
                    );
                } catch (e) { }
            }).catch(() => { });
            return response;
        }

        // Return response immediately, then track asynchronously (non-blocking)
        const responseTime = Date.now() - startTime;
        const response = NextResponse.json({
            success: true,
            message: "Event tracked successfully",
            timestamp: new Date().toISOString(),
        });

        // Execute tracking asynchronously after response (fire-and-forget)
        Promise.resolve().then(() => {
            try {
                // Track API request
                trackApiRequest(request, "/api/v1/analytics/track", "POST", {});

                // Route to appropriate tracking function based on event type
                const eventNameLower = eventName.toLowerCase();

                if (
                    eventNameLower.includes("transaction") ||
                    eventNameLower.includes("swap") ||
                    eventNameLower.includes("order")
                ) {
                    trackTransactionEvent(eventName, walletAddress, {
                        ...properties,
                        tracking_source: "api_endpoint",
                    });
                } else if (
                    eventNameLower.includes("funding") ||
                    eventNameLower.includes("fund")
                ) {
                    trackFundingEvent(eventName, walletAddress, {
                        ...properties,
                        tracking_source: "api_endpoint",
                    });
                } else if (
                    eventNameLower.includes("login") ||
                    eventNameLower.includes("signup") ||
                    eventNameLower.includes("sign up") ||
                    eventNameLower.includes("auth") ||
                    eventNameLower.includes("logout")
                ) {
                    // Extract IP and User-Agent for geo-location and OS/Browser detection
                    const ip =
                        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                        request.headers.get("x-real-ip") ||
                        null;
                    const userAgent = request.headers.get("user-agent") || null;

                    trackAuthEvent(eventName, walletAddress, {
                        ...properties,
                        tracking_source: "api_endpoint",
                        ...(ip && { ip_address: ip }),
                        ...(userAgent && { user_agent: userAgent }),
                    });
                } else {
                    // Generic business event
                    trackBusinessEvent(
                        eventName,
                        {
                            ...properties,
                            tracking_source: "api_endpoint",
                            wallet_address: walletAddress,
                        },
                        walletAddress,
                    );
                }

                // Track successful API response
                trackApiResponse("/api/v1/analytics/track", "POST", 200, responseTime, {
                    wallet_address: walletAddress,
                    event_name: eventName,
                });
            } catch (e) {
                // Silently fail - tracking is fire-and-forget and should not break user flow
            }
        }).catch(() => {
            // Silently ignore any Promise rejection
        });

        return response;
    } catch (error) {
        // Return error response immediately
        const responseTime = Date.now() - startTime;
        const response = NextResponse.json(
            {
                success: false,
                error: "Failed to track event",
            },
            { status: 500 },
        );

        // Track API error asynchronously (non-blocking)
        Promise.resolve().then(() => {
            try {
                trackApiError(
                    request,
                    "/api/v1/analytics/track",
                    "POST",
                    error as Error,
                    500,
                    {
                        response_time_ms: responseTime,
                    },
                );
            } catch (e) {
                // Ignore tracking errors
            }
        }).catch(() => { });

        return response;
    }
});

