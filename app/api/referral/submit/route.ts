import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
    trackApiRequest,
    trackApiResponse,
    trackApiError,
    trackBusinessEvent,
    trackAuthEvent,
} from "@/app/lib/server-analytics";

export const POST = withRateLimit(async (request: NextRequest) => {
    const startTime = Date.now();

    try {
        // Get wallet address from middleware
        const walletAddress = request.headers
            .get("x-wallet-address")
            ?.toLowerCase();

        if (!walletAddress) {
            trackApiError(
                request,
                "/api/referral/submit",
                "POST",
                new Error("Unauthorized"),
                401
            );
            return NextResponse.json(
                { success: false, error: "Unauthorized" },
                { status: 401 }
            );
        }

        // Track API request
        trackApiRequest(request, "/api/referral/submit", "POST", {
            wallet_address: walletAddress,
        });

        const body = await request.json();
        const { referral_code } = body;

        if (!referral_code) {
            trackApiError(
                request,
                "/api/referral/submit",
                "POST",
                new Error("Missing referral code"),
                400
            );
            return NextResponse.json(
                { success: false, error: "Referral code is required" },
                { status: 400 }
            );
        }

        const normalizedCode = referral_code.toUpperCase().trim();

        // Validate code format (6 characters, starts with NB)
        if (!/^NB[A-Z0-9]{4}$/.test(normalizedCode)) {
            return NextResponse.json(
                { success: false, error: "Invalid referral code format" },
                { status: 400 }
            );
        }

        // Check if user already has a referral
        const { data: existingReferral, error: existingError } =
            await supabaseAdmin
                .from("referrals")
                .select("id")
                .eq("referred_wallet_address", walletAddress)
                .single();

        if (existingError && existingError.code !== "PGRST116") {
            throw existingError;
        }

        if (existingReferral) {
            return NextResponse.json(
                { success: false, error: "You have already used a referral code" },
                { status: 409 }
            );
        }

        // Find the referrer by code
        const { data: referrer, error: referrerError } = await supabaseAdmin
            .from("users")
            .select("wallet_address, referral_code")
            .eq("referral_code", normalizedCode)
            .single();

        if (referrerError && referrerError.code !== "PGRST116") {
            throw referrerError;
        }

        if (!referrer) {
            trackBusinessEvent("Invalid Referral Code Used", {
                wallet_address: walletAddress,
                referral_code: normalizedCode,
            });

            return NextResponse.json(
                { success: false, error: "Invalid referral code" },
                { status: 404 }
            );
        }

        // Prevent self-referral
        if (referrer.wallet_address.toLowerCase() === walletAddress) {
            return NextResponse.json(
                { success: false, error: "You cannot refer yourself" },
                { status: 400 }
            );
        }

        // Create referral record with pending status
        const { data: referralData, error: insertError } = await supabaseAdmin
            .from("referrals")
            .insert({
                referrer_wallet_address: referrer.wallet_address,
                referred_wallet_address: walletAddress,
                referral_code: normalizedCode,
                status: "pending",
                reward_amount: 1.0, // $1 reward
                created_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (insertError) {
            throw insertError;
        }

        // Track successful response
        const responseTime = Date.now() - startTime;
        trackApiResponse(
            "/api/referral/submit",
            "POST",
            201,
            responseTime,
            {
                wallet_address: walletAddress,
                referral_code: normalizedCode,
                referrer_wallet_address: referrer.wallet_address,
                referral_id: referralData.id,
            }
        );

        // Track business event
        trackBusinessEvent("Referral Code Applied", {
            wallet_address: walletAddress,
            referrer_wallet_address: referrer.wallet_address,
            referral_code: normalizedCode,
            referral_id: referralData.id,
        });

        // Track auth event
        trackAuthEvent("Referral Code Submitted", walletAddress, {
            referrer_wallet_address: referrer.wallet_address,
            referral_code: normalizedCode,
        });

        return NextResponse.json(
            {
                success: true,
                data: {
                    referral_id: referralData.id,
                    message:
                        "Referral code applied! Complete KYC and your first transaction to earn rewards.",
                },
            },
            { status: 201 }
        );
    } catch (error) {
        console.error("Error submitting referral:", error);

        const responseTime = Date.now() - startTime;
        trackApiError(
            request,
            "/api/referral/submit",
            "POST",
            error as Error,
            500,
            {
                response_time_ms: responseTime,
            }
        );

        return NextResponse.json(
            { success: false, error: "Failed to submit referral code" },
            { status: 500 }
        );
    }
});