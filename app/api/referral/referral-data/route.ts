import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
    trackApiRequest,
    trackApiResponse,
    trackApiError,
    trackBusinessEvent,
} from "@/app/lib/server-analytics";
import {
  getPrivyUserIdFromRequest,
  getWalletAddressFromPrivyUserId,
} from "@/app/lib/privy";
import { generateReferralCode } from "@/app/utils";

export const GET = withRateLimit(async (request: NextRequest) => {
    const startTime = Date.now();

    try {
        const userId = await getPrivyUserIdFromRequest(request);

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

        const walletAddress = await getWalletAddressFromPrivyUserId(userId);

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
            const maxAttempts = 10;
            let generated: string | null = null;

            for (let attempt = 0; attempt < maxAttempts && !generated; attempt++) {
                const candidate = generateReferralCode();
                const { data: upsertData, error: upsertError } = await supabaseAdmin
                    .from("users")
                    .upsert(
                        {
                            wallet_address: walletAddress,
                            referral_code: candidate,
                            updated_at: new Date().toISOString(),
                        },
                        { onConflict: "wallet_address" }
                    )
                    .select("referral_code")
                    .single();

                if (!upsertError && upsertData?.referral_code) {
                    generated = upsertData.referral_code;
                    break;
                }

                if (
                    upsertError &&
                    (upsertError.code === "23505" ||
                        upsertError.message
                            ?.toLowerCase()
                            .includes("duplicate") ||
                        upsertError.message
                            ?.toLowerCase()
                            .includes("unique"))
                ) {
                    continue;
                }

                if (upsertError) {
                    throw upsertError;
                }
            }

            if (!generated) {
                throw new Error("Failed to generate unique referral code");
            }

            referralCode = generated;
            isNewlyGenerated = true;

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

        // Fetch this user's own claim rows so we can show per-user status.
        // referrals.status is shared (flips to "earned" when the first party
        // claims) so we derive each user's personal status from referral_claims:
        //   - completed claim row → "earned" for this user
        //   - anything else       → "pending" for this user
        const allReferralIds = [
            ...(referralsAsReferrer || []).map((r) => r.id),
            ...(referralsAsReferred || []).map((r) => r.id),
        ];

        const claimedReferralIds = new Set<string>();
        if (allReferralIds.length > 0) {
            const { data: myClaims } = await supabaseAdmin
                .from("referral_claims")
                .select("referral_id")
                .in("referral_id", allReferralIds)
                .eq("wallet_address", walletAddress)
                .eq("status", "completed");
            (myClaims || []).forEach((c) => claimedReferralIds.add(c.referral_id));
        }

        // Combine both lists and format
        const allReferrals = [
            // When user is referrer: show who they referred
            ...(referralsAsReferrer || []).map((r) => ({
                id: r.id,
                role: "referrer" as const,
                wallet_address: r.referred_wallet_address.toLowerCase(),
                wallet_address_short: `${r.referred_wallet_address.slice(0, 6)}...${r.referred_wallet_address.slice(-4)}`,
                // Per-user status: "earned" only if THIS user has a completed claim
                status: claimedReferralIds.has(r.id) ? "earned" : "pending",
                amount: r.reward_amount ?? 1.0,
                created_at: r.created_at,
                completed_at: r.completed_at,
            })),
            // When user is referred: show who referred them
            ...(referralsAsReferred || []).map((r) => ({
                id: r.id,
                role: "referred" as const,
                wallet_address: r.referrer_wallet_address.toLowerCase(),
                wallet_address_short: `${r.referrer_wallet_address.slice(0, 6)}...${r.referrer_wallet_address.slice(-4)}`,
                // Per-user status: "earned" only if THIS user has a completed claim
                status: claimedReferralIds.has(r.id) ? "earned" : "pending",
                amount: r.reward_amount ?? 1.0,
                created_at: r.created_at,
                completed_at: r.completed_at,
            })),
        ];

        // Calculate earnings from both perspectives
        const earnedReferrals = allReferrals.filter((r) => r.status === "earned");
        const pendingReferrals = allReferrals.filter((r) => r.status === "pending");

        const totalEarned = earnedReferrals.reduce(
            (sum, r) => sum + (r.amount ?? 0),
            0
        );
        const totalPending = pendingReferrals.reduce(
            (sum, r) => sum + (r.amount ?? 0),
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

        // Fire-and-forget: attempt auto-claim for referrals that now meet KYC +
        // volume requirements. Include "earned" referrals — the first party claiming
        // flips status to "earned" but the second party may still be unpaid.
        // Per-wallet idempotency is enforced in the claim route via referral_claims.
        const claimableReferrals = allReferrals.filter(
            (r) => r.status === "pending" || r.status === "earned"
        );
        if (claimableReferrals.length > 0) {
            const authHeader = request.headers.get("Authorization");
            const origin = request.headers.get("origin") || `https://${request.headers.get("host")}`;
            fetch(`${origin}/api/referral/claim`, {
                method: "GET",
                headers: {
                    ...(authHeader ? { Authorization: authHeader } : {}),
                    "x-user-id": userId!,
                },
            }).catch((e) =>
                console.error("Auto-claim background request failed:", e),
            );
        }

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