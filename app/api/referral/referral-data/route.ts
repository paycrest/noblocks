import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
    trackApiRequest,
    trackApiResponse,
    trackApiError,
} from "@/app/lib/server-analytics";

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
                "/api/referral/data",
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
        trackApiRequest(request, "/api/referral/data", "GET", {
            wallet_address: walletAddress,
        });

        // Get user's referral code
        const { data: userData, error: userError } = await supabaseAdmin
            .from("users")
            .select("referral_code")
            .eq("wallet_address", walletAddress)
            .single();

        if (userError) {
            throw userError;
        }

        if (!userData?.referral_code) {
            return NextResponse.json(
                {
                    success: false,
                    error: "No referral code found. Please generate one first.",
                },
                { status: 404 }
            );
        }

        // Get all referrals made by this user
        const { data: referrals, error: referralsError } = await supabaseAdmin
            .from("referrals")
            .select(
                `
        id,
        referred_wallet_address,
        status,
        reward_amount,
        created_at,
        completed_at
      `
            )
            .eq("referrer_wallet_address", walletAddress)
            .order("created_at", { ascending: false });

        if (referralsError) {
            throw referralsError;
        }

        // Calculate earnings
        const earnedReferrals = referrals.filter((r) => r.status === "earned");
        const pendingReferrals = referrals.filter((r) => r.status === "pending");

        const totalEarned = earnedReferrals.reduce(
            (sum, r) => sum + (r.reward_amount || 0),
            0
        );
        const totalPending = pendingReferrals.reduce(
            (sum, r) => sum + (r.reward_amount || 0),
            0
        );

        // Format referral list with truncated addresses
        const referralList = referrals.map((r) => ({
            id: r.id,
            wallet_address: r.referred_wallet_address,
            wallet_address_short: `${r.referred_wallet_address.slice(0, 6)}...${r.referred_wallet_address.slice(-4)}`,
            status: r.status,
            amount: r.reward_amount || 1.0,
            created_at: r.created_at,
            completed_at: r.completed_at,
        }));

        const response = {
            success: true,
            data: {
                referral_code: userData.referral_code,
                total_earned: totalEarned,
                total_pending: totalPending,
                total_referrals: referrals.length,
                earned_count: earnedReferrals.length,
                pending_count: pendingReferrals.length,
                referrals: referralList,
            },
        };

        // Track successful response
        const responseTime = Date.now() - startTime;
        trackApiResponse("/api/referral/data", "GET", 200, responseTime, {
            wallet_address: walletAddress,
            total_earned: totalEarned,
            total_pending: totalPending,
            total_referrals: referrals.length,
        });

        return NextResponse.json(response);
    } catch (error) {
        console.error("Error fetching referral data:", error);

        const responseTime = Date.now() - startTime;
        trackApiError(
            request,
            "/api/referral/data",
            "GET",
            error as Error,
            500,
            {
                response_time_ms: responseTime,
            }
        );

        return NextResponse.json(
            { success: false, error: "Failed to fetch referral data" },
            { status: 500 }
        );
    }
});