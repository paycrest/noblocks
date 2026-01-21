import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
    trackApiRequest,
    trackApiResponse,
    trackApiError,
    trackBusinessEvent,
} from "@/app/lib/server-analytics";
import { getSmartWalletAddressFromPrivyUserId } from "@/app/lib/privy";
import { generateReferralCode } from "@/app/utils";

export const GET = withRateLimit(async (request: NextRequest) => {
    const startTime = Date.now();

    try {
        // Get user ID from middleware
        const userId = request.headers.get("x-user-id");

        if (!userId) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Unauthorized",
                    code: "AUTH_REQUIRED",
                    message: "Authentication required. Please sign in to view your referral data.",
                    response_time_ms: Date.now() - startTime,
                },
                { status: 401 },
            );
        }

        const walletAddress = await getSmartWalletAddressFromPrivyUserId(userId);

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

        // Get referrals where user is the referrer (people they referred)
        const { data: referralsAsReferrer, error: referrerError } = await supabaseAdmin
            .from("referrals")
            .select(
                `
        id,
        referrer_wallet_address,
        referred_wallet_address,
        status,
        reward_amount,
        created_at,
        completed_at
      `
            )
            .eq("referrer_wallet_address", walletAddress)
            .order("created_at", { ascending: false });

        if (referrerError) {
            throw referrerError;
        }

        // Get referrals where user is the referred (who referred them)
        const { data: referralsAsReferred, error: referredError } = await supabaseAdmin
            .from("referrals")
            .select(
                `
        id,
        referrer_wallet_address,
        referred_wallet_address,
        status,
        reward_amount,
        created_at,
        completed_at
      `
            )
            .eq("referred_wallet_address", walletAddress)
            .order("created_at", { ascending: false });

        if (referredError) {
            throw referredError;
        }

        // Combine both lists and format
        const allReferrals = [
            // When user is referrer: show who they referred
            ...(referralsAsReferrer || []).map((r) => ({
                id: r.id,
                wallet_address: r.referred_wallet_address.toLowerCase(),
                wallet_address_short: `${r.referred_wallet_address.slice(0, 6)}...${r.referred_wallet_address.slice(-4)}`,
                status: r.status,
                amount: r.reward_amount || 1.0,
                created_at: r.created_at,
                completed_at: r.completed_at,
            })),
            // When user is referred: show who referred them
            ...(referralsAsReferred || []).map((r) => ({
                id: r.id,
                wallet_address: r.referrer_wallet_address.toLowerCase(),
                wallet_address_short: `${r.referrer_wallet_address.slice(0, 6)}...${r.referrer_wallet_address.slice(-4)}`,
                status: r.status,
                amount: r.reward_amount || 1.0,
                created_at: r.created_at,
                completed_at: r.completed_at,
            })),
        ];

        // Calculate earnings from both perspectives
        const earnedReferrals = allReferrals.filter((r) => r.status === "earned");
        const pendingReferrals = allReferrals.filter((r) => r.status === "pending");

        const totalEarned = earnedReferrals.reduce(
            (sum, r) => sum + (r.amount || 0),
            0
        );
        const totalPending = pendingReferrals.reduce(
            (sum, r) => sum + (r.amount || 0),
            0
        );

        // Format referral list (sorted by created_at descending)
        const referralList = allReferrals.sort((a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        const response = {
            success: true,
            data: {
                referral_code: referralCode,
                total_earned: totalEarned,
                total_pending: totalPending,
                total_referrals: referralList.length,
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
            total_referrals: referralList.length,
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