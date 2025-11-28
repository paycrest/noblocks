import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
    identifyServerUser,
    trackApiRequest,
    trackApiResponse,
    trackApiError,
} from "@/app/lib/server-analytics";

/**
 * Server-side user identification API endpoint
 * Accepts user data from client and identifies user in Mixpanel server-side
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

        const {
            walletAddress: bodyWalletAddress,
            properties = {},
        } = body as {
            walletAddress?: string;
            properties?: {
                login_method?: string | null;
                isNewUser?: boolean;
                createdAt?: Date | string;
                email?: { address: string } | null;
            };
        };

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
                        "/api/v1/analytics/identify",
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
                        "/api/v1/analytics/identify",
                        "POST",
                        new Error("Invalid wallet address format"),
                        400,
                    );
                } catch (e) { }
            }).catch(() => { });
            return response;
        }

        // Prepare user properties for Mixpanel
        const userProperties: {
            login_method?: string;
            isNewUser?: boolean;
            $signup_date?: string;
            $email?: string;
            $last_login?: string;
        } = {};

        if (properties.login_method) {
            userProperties.login_method = properties.login_method;
        }

        if (properties.isNewUser !== undefined) {
            userProperties.isNewUser = properties.isNewUser;
        }

        if (properties.createdAt) {
            userProperties.$signup_date =
                properties.createdAt instanceof Date
                    ? properties.createdAt.toISOString()
                    : properties.createdAt;
        }

        if (
            process.env.NEXT_PUBLIC_ENABLE_EMAIL_IN_ANALYTICS === "true" &&
            properties.email?.address
        ) {
            userProperties.$email = properties.email.address;
        }

        // Set last login timestamp
        userProperties.$last_login = new Date().toISOString();

        // Return response immediately, then track asynchronously (non-blocking)
        const responseTime = Date.now() - startTime;
        const response = NextResponse.json({
            success: true,
            message: "User identified successfully",
            timestamp: new Date().toISOString(),
        });

        // Execute tracking asynchronously after response (fire-and-forget)
        Promise.resolve().then(() => {
            try {
                // Extract IP and User-Agent for geo-location and OS/Browser detection
                const ip =
                    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                    request.headers.get("x-real-ip") ||
                    null;
                const userAgent = request.headers.get("user-agent") || null;

                // Track API request
                trackApiRequest(request, "/api/v1/analytics/identify", "POST", {});
                // Identify user server-side (IP and User-Agent passed for geo-location/device info)
                identifyServerUser(walletAddress, {
                    ...userProperties,
                    ...(ip && { ip_address: ip }),
                    ...(userAgent && { user_agent: userAgent }),
                });
                // Track successful API response
                trackApiResponse("/api/v1/analytics/identify", "POST", 200, responseTime, {
                    wallet_address: walletAddress,
                    is_new_user: properties.isNewUser,
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
                error: "Failed to identify user",
            },
            { status: 500 },
        );

        // Track API error asynchronously (non-blocking)
        Promise.resolve().then(() => {
            try {
                trackApiError(
                    request,
                    "/api/v1/analytics/identify",
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

