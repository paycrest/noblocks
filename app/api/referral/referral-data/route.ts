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
        let { data: userData, error: userError } = await supabaseAdmin
            .from("users")
            .select("referral_code")
            .eq("wallet_address", walletAddress)
            .single();

        if (userError && userError.code !== "PGRST116") {
            throw userError;
        }

        // Auto-generate if no valid code (null/empty/missing user)
        let referralCode = userData?.referral_code;
        let isNewlyGenerated = false;
        if (!referralCode || referralCode.trim() === "") {
            // Generate unique code
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

            // Upsert user with code
            const { data: upsertData, error: upsertError } = await supabaseAdmin
                .from("users")
                .upsert(
                    {
                        wallet_address: walletAddress,
                        referral_code: code,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: "wallet_address" }
                )
                .select("referral_code")
                .single();

            if (upsertError) {
                throw upsertError;
            }

            referralCode = upsertData.referral_code;
            isNewlyGenerated = true;

            // Track generation
            trackBusinessEvent("Referral Code Auto-Generated", {
                wallet_address: walletAddress,
                referral_code: referralCode,
            });
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
                referral_code: referralCode,
                total_earned: totalEarned,
                total_pending: totalPending,
                total_referrals: referrals.length,
                earned_count: earnedReferrals.length,
                pending_count: pendingReferrals.length,
                referrals: referralList,
                newly_generated: isNewlyGenerated, // Optional: For UI toast
            },
        };

        // Track successful response
        const responseTime = Date.now() - startTime;
        trackApiResponse("/api/referral/data", "GET", 200, responseTime, {
            wallet_address: walletAddress,
            total_earned: totalEarned,
            total_pending: totalPending,
            total_referrals: referrals.length,
            newly_generated: isNewlyGenerated,
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