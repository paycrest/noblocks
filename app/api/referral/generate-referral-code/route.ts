import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
    trackApiRequest,
    trackApiResponse,
    trackApiError,
    trackBusinessEvent,
} from "@/app/lib/server-analytics";

// Generate a unique 6-character referral code (NB + 4 alphanumeric)
function generateReferralCode(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "NB";
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

export const GET = withRateLimit(async (request: NextRequest) => {
    const startTime = Date.now();

    try {
        // Get wallet address from middleware
        const walletAddress = request.headers
            .get("x-wallet-address")
            ?.toLowerCase();

        if (!walletAddress) {
            trackApiError(
                request,
                "/api/referral/generate-referral-code",
                "GET",
                new Error("Unauthorized"),
                401
            );
            return NextResponse.json(
                { success: false, error: "Unauthorized" },
                { status: 401 }
            );
        }

        // Track API request
        trackApiRequest(request, "/api/referral/generate-referral-code", "GET", {
            wallet_address: walletAddress,
        });

        // Check if user already has a referral code
        const { data: existingUser, error: fetchError } = await supabaseAdmin
            .from("users")
            .select("referral_code")
            .eq("wallet_address", walletAddress)
            .single();

        if (fetchError && fetchError.code !== "PGRST116") {
            throw fetchError;
        }

        // If user has a code, return it
        if (existingUser?.referral_code) {
            const responseTime = Date.now() - startTime;
            trackApiResponse("/api/referral/generate-referral-code", "GET", 200, responseTime, {
                wallet_address: walletAddress,
                referral_code: existingUser.referral_code,
                action: "retrieved",
            });

            return NextResponse.json({
                success: true,
                data: {
                    referral_code: existingUser.referral_code,
                },
            });
        }

        // Generate a new unique code
        let code: string | null = null;
        let attempts = 0;
        const maxAttempts = 10;

        while (!code && attempts < maxAttempts) {
            const candidate = generateReferralCode();
            attempts++;

            const { data: existing, error: existingError } = await supabaseAdmin
                .from("users")
                .select("wallet_address")
                .eq("referral_code", candidate)
                .single();

            // Treat "no row" as available; any other error should bubble up
            if (existingError && existingError.code !== "PGRST116") {
                throw existingError;
            }

            if (!existing) {
                code = candidate;
            }
        }

        if (!code) {
            throw new Error("Failed to generate unique referral code");
        }

        // Update or insert user with new code
        const { data: userData, error: upsertError } = await supabaseAdmin
            .from("users")
            .upsert(
                {
                    wallet_address: walletAddress,
                    referral_code: code,
                    updated_at: new Date().toISOString(),
                },
                {
                    onConflict: "wallet_address",
                }
            )
            .select()
            .single();

        if (upsertError) {
            throw upsertError;
        }

        // Track successful response
        const responseTime = Date.now() - startTime;
        trackApiResponse("/api/referral/generate-referral-code", "GET", 200, responseTime, {
            wallet_address: walletAddress,
            referral_code: code,
            action: "generated",
        });

        // Track business event
        trackBusinessEvent("Referral Code Generated", {
            wallet_address: walletAddress,
            referral_code: code,
        });

        return NextResponse.json({
            success: true,
            data: {
                referral_code: code,
                message: "Referral code generated successfully",
            },
        });
    } catch (error) {
        console.error("Error generating referral code:", error);

        const responseTime = Date.now() - startTime;
        trackApiError(request, "/api/referral/generate-referral-code", "GET", error as Error, 500, {
            response_time_ms: responseTime,
        });

        return NextResponse.json(
            { success: false, error: "Failed to generate referral code" },
            { status: 500 }
        );
    }
});