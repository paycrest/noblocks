import { NextRequest, NextResponse, after } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
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
            after(() => {
                try {
                    trackApiError(
                        request,
                        "/api/v1/analytics/track",
                        "POST",
                        new Error("Missing or invalid eventName"),
                        400,
                    );
                } catch (e) { }
            });
            return response;
        }

        // Try to get wallet address from auth context (middleware header) first
        // Fall back to body walletAddress if not available
        const walletAddress =
            request.headers.get("x-wallet-address")?.toLowerCase() ||
            (typeof bodyWalletAddress === "string"
                ? bodyWalletAddress.toLowerCase()
                : undefined);

        // Validate wallet address format only if present
        if (walletAddress && !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
            const response = NextResponse.json(
                { success: false, error: "Invalid wallet address format" },
                { status: 400 },
            );
            // Track error asynchronously
            after(() => {
                try {
                    trackApiError(
                        request,
                        "/api/v1/analytics/track",
                        "POST",
                        new Error("Invalid wallet address format"),
                        400,
                    );
                } catch (e) { }
            });
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
        after(() => {
            try {
                // Extract IP and User-Agent for geo-location and OS/Browser detection (once for all events)
                const ip =
                    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                    request.headers.get("x-real-ip") ||
                    undefined;
                const userAgent = request.headers.get("user-agent") || undefined;

                // Track API request
                trackApiRequest(request, "/api/v1/analytics/track", "POST", {
                    ip_address: ip,
                    user_agent: userAgent,
                });

                // Route to appropriate tracking function based on event type
                const eventNameLower = eventName.toLowerCase();

                // Common properties for all events (IP and User-Agent for geo-location)
                const commonProperties: Record<string, any> = {
                    ...properties,
                    tracking_source: "api_endpoint",
                };
                if (ip) commonProperties.ip_address = ip;
                if (userAgent) commonProperties.user_agent = userAgent;

                // Transaction/Swap events (require wallet address)
                if (
                    eventNameLower.includes("transaction") ||
                    eventNameLower.includes("swap") ||
                    (eventNameLower.includes("order") && !eventNameLower.includes("order created") && !eventNameLower.includes("order updated"))
                ) {
                    if (walletAddress) {
                        trackTransactionEvent(eventName, walletAddress, commonProperties);
                    } else {
                        // Track as generic event if no wallet address for transaction events
                        trackBusinessEvent(
                            eventName,
                            commonProperties,
                            walletAddress,
                        );
                    }
                }
                // Funding events (require wallet address)
                else if (
                    eventNameLower.includes("funding") ||
                    eventNameLower.includes("fund")
                ) {
                    if (walletAddress) {
                        trackFundingEvent(eventName, walletAddress, commonProperties);
                    } else {
                        trackBusinessEvent(
                            eventName,
                            commonProperties,
                            walletAddress,
                        );
                    }
                }
                // Auth events (require wallet address)
                else if (
                    eventNameLower.includes("login") ||
                    eventNameLower.includes("signup") ||
                    eventNameLower.includes("sign up") ||
                    eventNameLower.includes("user register") ||
                    eventNameLower.includes("user login") ||
                    eventNameLower.includes("user logout") ||
                    eventNameLower.includes("user identified") ||
                    eventNameLower.includes("auth") ||
                    eventNameLower.includes("logout")
                ) {
                    if (walletAddress) {
                        trackAuthEvent(eventName, walletAddress, commonProperties);
                    } else {
                        trackBusinessEvent(
                            eventName,
                            commonProperties,
                            walletAddress,
                        );
                    }
                }
                // Order Created/Updated (can be tracked without explicit wallet address if needed, but usually associated)
                else if (
                    eventNameLower.includes("order created") ||
                    eventNameLower.includes("order updated")
                ) {
                    trackBusinessEvent(
                        eventName,
                        {
                            ...commonProperties,
                            ...(walletAddress && { wallet_address: walletAddress }),
                        },
                        walletAddress,
                    );
                }
                // Generic business event (for all other events like Page Viewed, Button Clicked, etc.)
                else {
                    trackBusinessEvent(
                        eventName,
                        {
                            ...commonProperties,
                            ...(walletAddress && { wallet_address: walletAddress }),
                        },
                        walletAddress,
                    );
                }

                // Track successful API response
                const responseProperties: Record<string, any> = {
                    ...(walletAddress && { wallet_address: walletAddress }),
                    event_name: eventName,
                };
                if (ip) responseProperties.ip_address = ip;
                if (userAgent) responseProperties.user_agent = userAgent;
                trackApiResponse("/api/v1/analytics/track", "POST", 200, responseTime, responseProperties);
            } catch (e) {
                // Silently fail - tracking is fire-and-forget and should not break user flow
            }
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
        after(() => {
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
        });

        return response;
    }
});