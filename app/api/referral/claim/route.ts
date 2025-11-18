import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
    trackApiRequest,
    trackApiResponse,
    trackApiError,
    trackBusinessEvent,
} from "@/app/lib/server-analytics";
import { fetchKYCStatus } from "@/app/api/aggregator";

// This should be called after a user completes KYC + first transaction
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
                "/api/referral/claim",
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
        trackApiRequest(request, "/api/referral/claim", "POST", {
            wallet_address: walletAddress,
        });

        // Do not trust client-provided flags. Claim will perform authoritative server-side
        // verification of KYC and qualifying transaction below.

        // Find pending referral for this user
        const { data: referral, error: referralError } = await supabaseAdmin
            .from("referrals")
            .select("*")
            .eq("referred_wallet_address", walletAddress)
            .eq("status", "pending")
            .single();

        if (referralError && referralError.code !== "PGRST116") {
            throw referralError;
        }

        if (!referral) {
            return NextResponse.json(
                {
                    success: false,
                    error: "No pending referral found",
                },
                { status: 404 }
            );
        }

        // Verify KYC for both referrer and referred using authoritative aggregator
        try {
            const [referrerKyc, referredKyc] = await Promise.all([
                fetchKYCStatus(referral.referrer_wallet_address),
                fetchKYCStatus(walletAddress),
            ]);

            const referrerVerified = referrerKyc?.data?.status === "verified";
            const referredVerified = referredKyc?.data?.status === "verified";

            if (!referrerVerified || !referredVerified) {
                const missing = [] as string[];
                if (!referrerVerified) missing.push("referrer");
                if (!referredVerified) missing.push("referred user");

                return NextResponse.json(
                    {
                        success: false,
                        error: `KYC verification required for: ${missing.join(", ")}`,
                    },
                    { status: 400 }
                );
            }
        } catch (kycErr) {
            console.error("Error checking KYC status:", kycErr);
            const responseTime = Date.now() - startTime;
            trackApiError(
                request,
                "/api/referral/claim",
                "POST",
                kycErr as Error,
                500,
                { response_time_ms: responseTime }
            );

            return NextResponse.json({ success: false, error: "Failed to verify KYC status" }, { status: 500 });
        }

        // SERVER-SIDE: verify referred user's qualifying transaction
        try {
            const { data: txs, error: txErr } = await supabaseAdmin
                .from("transactions")
                .select("*")
                .eq("wallet_address", walletAddress)
                .eq("status", "completed")
                .order("created_at", { ascending: true })
                .limit(1);

            if (txErr) {
                throw txErr;
            }

            if (!txs || txs.length === 0) {
                return NextResponse.json({ success: false, error: "No qualifying completed transaction found for referred user" }, { status: 400 });
            }

            const tx = txs[0];
            const amountUsd = tx.amount_usd ?? tx.amount_received ?? 0;
            if (Number(amountUsd) < 20) {
                return NextResponse.json({ success: false, error: "Referred user's first completed transaction does not meet the minimum amount requirement" }, { status: 400 });
            }
        } catch (txCheckErr) {
            console.error("Error checking transactions:", txCheckErr);
            const responseTime = Date.now() - startTime;
            trackApiError(request, "/api/referral/claim", "POST", txCheckErr as Error, 500, { response_time_ms: responseTime });
            return NextResponse.json({ success: false, error: "Failed to verify transactions" }, { status: 500 });
        }

        // SAFE STATUS TRANSITION: pending -> processing
        const { data: processingRows, error: processingErr } = await supabaseAdmin
            .from("referrals")
            .update({ status: "processing" })
            .eq("id", referral.id)
            .eq("status", "pending")
            .select();

        if (processingErr) {
            throw processingErr;
        }

        if (!processingRows || processingRows.length === 0) {
            // Already being processed or completed by another worker
            return NextResponse.json({ success: false, error: "Referral is already being processed or has been completed" }, { status: 409 });
        }

        // Credit rewards to both users
        // Best-effort: call internal wallet crediting endpoint when configured.
        // If crediting fails, roll back referral status to pending to keep consistency.
        const internalAuth = process.env.INTERNAL_API_KEY;
        const internalBase = process.env.INTERNAL_API_BASE_URL || new URL(request.url).origin;

        async function creditWallet(wallet: string, amountMicro: number, referralId: any) {
            if (!internalAuth) {
                // Wallet service not configured; skip actual crediting.
                console.warn("Internal wallet service not configured, skipping credit for", wallet);
                return { ok: false, skipped: true };
            }

            const resp = await fetch(`${internalBase}/api/internal/credit-wallet`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-internal-auth": internalAuth,
                },
                body: JSON.stringify({
                    wallet_address: wallet,
                    amount: amountMicro,
                    currency: "USDC",
                    reason: "referral_reward",
                    referral_id: referralId,
                    idempotency_key: `referral:${referral.id}:${wallet}`,
                }),
            });

            if (!resp.ok) {
                const text = await resp.text().catch(() => "");
                throw new Error(`Wallet credit failed: ${resp.status} ${text}`);
            }

            return { ok: true };
        }

        try {
            // credit referrer
            const amountMicro = Math.round((referral.reward_amount || 1.0) * 1_000_000);
            await creditWallet(referral.referrer_wallet_address, amountMicro, referral.id);
            // credit referred user
            await creditWallet(walletAddress, amountMicro, referral.id);
        } catch (walletError) {
            console.error("Wallet crediting failed, attempting rollback:", walletError);
            // Roll back referral status to pending
            try {
                await supabaseAdmin.from("referrals").update({ status: "pending", completed_at: null }).eq("id", referral.id);
            } catch (rbErr) {
                console.error("Failed to roll back referral status:", rbErr);
            }

            const responseTime = Date.now() - startTime;
            trackApiError(request, "/api/referral/claim", "POST", walletError as Error, 500, { response_time_ms: responseTime });

            return NextResponse.json({ success: false, error: "Failed to credit referral rewards" }, { status: 500 });
        }

        // Mark referral as earned and set completed_at
        try {
            const { error: earnErr } = await supabaseAdmin
                .from("referrals")
                .update({ status: "earned", completed_at: new Date().toISOString() })
                .eq("id", referral.id);
            if (earnErr) throw earnErr;
        } catch (earnErr) {
            console.error("Failed to finalize referral status as earned:", earnErr);
            // Note: credits may already have been sent; log and continue
        }

        const responseTime = Date.now() - startTime;
        trackApiResponse(
            "/api/referral/claim",
            "POST",
            200,
            responseTime,
            {
                wallet_address: walletAddress,
                referrer_wallet_address: referral.referrer_wallet_address,
                referral_id: referral.id,
                reward_amount: referral.reward_amount,
            }
        );

        // Track business events
        trackBusinessEvent("Referral Completed", {
            referred_wallet_address: walletAddress,
            referrer_wallet_address: referral.referrer_wallet_address,
            referral_id: referral.id,
            reward_amount: referral.reward_amount,
        });

        trackBusinessEvent("Referral Reward Earned", {
            wallet_address: referral.referrer_wallet_address,
            referred_wallet_address: walletAddress,
            reward_amount: referral.reward_amount,
        });

        trackBusinessEvent("Referral Bonus Received", {
            wallet_address: walletAddress,
            referrer_wallet_address: referral.referrer_wallet_address,
            reward_amount: referral.reward_amount,
        });

        return NextResponse.json({
            success: true,
            data: {
                referral_id: referral.id,
                referrer_wallet_address: referral.referrer_wallet_address,
                reward_amount: referral.reward_amount,
                message: "Referral rewards have been credited!",
            },
        });
    } catch (error) {
        console.error("Error completing referral:", error);

        const responseTime = Date.now() - startTime;
        trackApiError(
            request,
            "/api/referral/claim",
            "POST",
            error as Error,
            500,
            {
                response_time_ms: responseTime,
            }
        );

        return NextResponse.json(
            { success: false, error: "Failed to claim referral" },
            { status: 500 }
        );
    }
});