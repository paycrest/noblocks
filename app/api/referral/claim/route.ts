import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import { supabaseAdmin } from "@/app/lib/supabase";
import { fetchKYCStatus } from "@/app/api/aggregator";
import { getSmartWalletAddressFromPrivyUserId } from "@/app/lib/privy";
import { getRpcUrl, FALLBACK_TOKENS } from "@/app/utils";
import { createWalletClient, createPublicClient, http, parseUnits, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { erc20Abi } from "viem";
import { cashbackConfig } from "@/app/lib/server-config";

// Referral program configuration
const REWARD_AMOUNT_USD = 1;
const MIN_TX_VOLUME_USD = 100;

export const POST = withRateLimit(async (request: NextRequest) => {
    const start = Date.now();
    try {
        const userId = request.headers.get("x-user-id");
        if (!userId) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Unauthorized",
                    code: "AUTH_REQUIRED",
                    message: "Authentication required. Please sign in to claim referral rewards.",
                    response_time_ms: Date.now() - start,
                },
                { status: 401 },
            );
        }

        const walletAddress = await getSmartWalletAddressFromPrivyUserId(userId);

        // Validate request body
        const contentType = request.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Unsupported content type",
                    code: "INVALID_CONTENT_TYPE",
                    message: "Request must be sent with Content-Type: application/json",
                    response_time_ms: Date.now() - start,
                },
                { status: 415 },
            );
        }

        const body = await request.json().catch(() => null);

        if (!body || typeof body.referralId !== "string") {
            return NextResponse.json(
                {
                    success: false,
                    error: "Invalid request body",
                    code: "MISSING_REFERRAL_ID",
                    message: "referralId is required in request body",
                    response_time_ms: Date.now() - start,
                },
                { status: 400 },
            );
        }

        const { referralId } = body;

        if (!cashbackConfig.walletPrivateKey) {
            console.error("Referral funding wallet not configured: CASHBACK_WALLET_PRIVATE_KEY is missing");
            return NextResponse.json(
                {
                    success: false,
                    error: "Referral service not configured",
                    code: "SERVICE_UNAVAILABLE",
                    message: "Referral rewards are temporarily unavailable. Please try again later.",
                    response_time_ms: Date.now() - start,
                },
                { status: 503 },
            );
        }

        // Fetch the specific referral and validate ownership
        let referral;
        try {
            const { data, error } = await supabaseAdmin
                .from("referrals")
                .select("*")
                .eq("id", referralId)
                .in("status", ["pending", "earned"])
                .single();

            if (error || !data) {
                return NextResponse.json(
                    {
                        success: false,
                        error: "Referral not found",
                        code: "REFERRAL_NOT_FOUND",
                        message: "The specified referral was not found or is not eligible for claiming.",
                        response_time_ms: Date.now() - start,
                    },
                    { status: 404 },
                );
            }

            // Verify that the caller is either the referrer or the referred user
            const isReferrer = data.referrer_wallet_address.toLowerCase() === walletAddress.toLowerCase();
            const isReferred = data.referred_wallet_address.toLowerCase() === walletAddress.toLowerCase();

            if (!isReferrer && !isReferred) {
                return NextResponse.json(
                    {
                        success: false,
                        error: "Unauthorized",
                        code: "UNAUTHORIZED_REFERRAL",
                        message: "You are not authorized to claim this referral reward.",
                        response_time_ms: Date.now() - start,
                    },
                    { status: 403 },
                );
            }

            referral = data;
        } catch (error) {
            console.error("Failed to fetch referral:", error);
            return NextResponse.json(
                {
                    success: false,
                    error: "Failed to fetch referral",
                    code: "DATABASE_ERROR",
                    message: "Unable to retrieve your referral information. Please try again.",
                    response_time_ms: Date.now() - start,
                },
                { status: 500 },
            );
        }

        // Verify KYC and transaction volume for the caller only
        // Each user must complete KYC + transaction volume before receiving funds
        try {
            // Check caller's KYC status
            const callerKyc = await fetchKYCStatus(walletAddress);
            const callerVerified = callerKyc?.data?.status === "verified";

            if (!callerVerified) {
                return NextResponse.json(
                    {
                        success: false,
                        error: "KYC verification required",
                        code: "KYC_REQUIRED",
                        message: "You must complete KYC verification before claiming referral rewards.",
                        response_time_ms: Date.now() - start,
                    },
                    { status: 400 },
                );
            }

            // Check caller's transaction volume
            const { data: callerTxs, error: callerTxError } = await supabaseAdmin
                .from("transactions")
                .select("amount_usd, amount_received")
                .eq("wallet_address", walletAddress)
                .eq("status", "completed");

            if (callerTxError) {
                throw new Error(`Failed to fetch transactions: ${callerTxError.message}`);
            }

            const callerTotalUsd = (callerTxs || []).reduce(
                (sum, tx) => sum + Number(tx.amount_usd || tx.amount_received || 0),
                0
            );
            const callerMeetsVolume = callerTotalUsd >= MIN_TX_VOLUME_USD;

            if (!callerMeetsVolume) {
                return NextResponse.json(
                    {
                        success: false,
                        error: "Insufficient transaction volume",
                        code: "VOLUME_NOT_MET",
                        message: `Your transaction volume $${callerTotalUsd.toFixed(2)} is less than the required $${MIN_TX_VOLUME_USD}. Complete more transactions to claim.`,
                        details: {
                            currentVolume: callerTotalUsd,
                            required: MIN_TX_VOLUME_USD,
                        },
                        response_time_ms: Date.now() - start,
                    },
                    { status: 400 },
                );
            }
        } catch (error) {
            console.error("Failed to verify requirements:", error);
            return NextResponse.json(
                {
                    success: false,
                    error: "Requirement verification failed",
                    code: "VERIFICATION_ERROR",
                    message: "Unable to verify KYC status or transaction volume. Please try again later.",
                    response_time_ms: Date.now() - start,
                },
                { status: 500 },
            );
        }
        //Check for existing claim by this caller (idempotency)
        const { data: existingClaim, error: existingClaimError } = await supabaseAdmin
            .from("referral_claims")
            .select("*")
            .eq("referral_id", referral.id)
            .eq("wallet_address", walletAddress)
            .single();

        if (existingClaimError && existingClaimError.code !== "PGRST116") {
            console.error("Failed to fetch existing referral claim:", existingClaimError);
            return NextResponse.json(
                {
                    success: false,
                    error: "Failed to fetch referral claim",
                    code: "CLAIM_LOOKUP_FAILED",
                    message: "Unable to verify existing referral claim. Please try again.",
                    response_time_ms: Date.now() - start,
                },
                { status: 500 },
            );
        }

        if (existingClaim) {
            return NextResponse.json({
                success: existingClaim.status === "completed",
                message: `Referral reward already ${existingClaim.status}`,
                claim: {
                    amount: existingClaim.reward_amount,
                    status: existingClaim.status,
                    txHash: existingClaim.tx_hash,
                },
                response_time_ms: Date.now() - start,
            });
        }
        // Create pending claim record
        const { data: pendingClaim, error: claimError } = await supabaseAdmin
            .from("referral_claims")
            .insert({
                referral_id: referral.id,
                wallet_address: walletAddress,
                reward_amount: REWARD_AMOUNT_USD,
                status: "pending",
            })
            .select()
            .single();
        if (claimError || !pendingClaim) {
            console.error("Failed to create claim record:", claimError);
            return NextResponse.json(
                {
                    success: false,
                    error: "Failed to create claim record",
                    code: "CLAIM_CREATION_FAILED",
                    message: "Unable to process your referral claim. Please try again.",
                    response_time_ms: Date.now() - start,
                },
                { status: 500 },
            );
        }
        // Execute reward transfer
        try {
            // Validate private key format
            const privateKey = cashbackConfig.walletPrivateKey;
            if (
                !privateKey ||
                !privateKey.startsWith("0x") ||
                privateKey.length !== 66
            ) {
                throw new Error("Invalid private key format in configuration");
            }
            // Create wallet account from private key
            const account = privateKeyToAccount(privateKey as `0x${string}`);
            const sendingWalletAddress = account.address;

            if (cashbackConfig.walletAddress &&
                cashbackConfig.walletAddress.toLowerCase() !== sendingWalletAddress.toLowerCase()) {
                return NextResponse.json(
                    {
                        success: false,
                        error: "Wallet address mismatch",
                        code: "WALLET_ADDRESS_MISMATCH",
                        message: "Configured wallet address does not match the private key. Please check your CASHBACK_WALLET_ADDRESS configuration.",
                        response_time_ms: Date.now() - start,
                    },
                    { status: 500 },
                );
            }

            // Get RPC URL
            const rpcUrl = getRpcUrl("Base");
            if (!rpcUrl) {
                throw new Error("Base RPC not configured");
            }

            // Get USDC token from FALLBACK_TOKENS
            const baseTokens = FALLBACK_TOKENS["Base"];
            const usdcToken = baseTokens.find((t) => t.symbol === "USDC");

            if (!usdcToken) {
                throw new Error("USDC token not found on Base");
            }

            const publicClient = createPublicClient({
                chain: base,
                transport: http(rpcUrl),
            });

            const walletClient = createWalletClient({
                account,
                chain: base,
                transport: http(rpcUrl),
            });

            const amountInWei = parseUnits(
                REWARD_AMOUNT_USD.toString(),
                usdcToken.decimals,
            );

            // Check if wallet has sufficient USDC balance (only need 1x for the caller)
            const currentBalance = await publicClient.readContract({
                address: usdcToken.address as `0x${string}`,
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [sendingWalletAddress as `0x${string}`],
            });

            if (currentBalance < amountInWei) {
                const currentBalanceUsd = parseFloat(
                    formatUnits(currentBalance, usdcToken.decimals)
                );
                return NextResponse.json(
                    {
                        success: false,
                        error: "Insufficient funds",
                        code: "INSUFFICIENT_BALANCE",
                        message: `Insufficient USDC balance in cashback wallet. Required: $${REWARD_AMOUNT_USD.toFixed(2)}, Available: $${currentBalanceUsd.toFixed(2)}`,
                        details: {
                            required: REWARD_AMOUNT_USD,
                            available: currentBalanceUsd,
                            walletAddress: sendingWalletAddress,
                        },
                        response_time_ms: Date.now() - start,
                    },
                    { status: 503 },
                );
            }

            // Execute transfer only to the caller who completed requirements
            const txHash = await walletClient.writeContract({
                address: usdcToken.address as `0x${string}`,
                abi: erc20Abi,
                functionName: "transfer",
                args: [walletAddress as `0x${string}`, amountInWei],
            });

            const { error: updateError } = await supabaseAdmin
                .from("referral_claims")
                .update({
                    status: "completed",
                    tx_hash: txHash,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", pendingClaim.id);
            if (updateError) {
                console.error(
                    `MANUAL REVIEW NEEDED: Claim ${pendingClaim.id} transferred but status update failed`,
                );
            }

            // Update referral status to "earned" immediately when user claims their reward
            const { error: referralStatusError } = await supabaseAdmin
                .from("referrals")
                .update({
                    status: "earned",
                    updated_at: new Date().toISOString(),
                })
                .eq("id", referral.id);
            if (referralStatusError) {
                console.error("Failed to update referral status:", referralStatusError);
                console.error(
                    `MANUAL REVIEW NEEDED: Referral ${referral.id} was paid out but status update failed`,
                );
            }

            return NextResponse.json({
                success: true,
                claim: {
                    amount: REWARD_AMOUNT_USD,
                    status: "completed",
                    txHash: txHash,
                },
                response_time_ms: Date.now() - start,
            });
        } catch (transferError) {
            await supabaseAdmin
                .from("referral_claims")
                .update({
                    status: "failed",
                    updated_at: new Date().toISOString(),
                })
                .eq("id", pendingClaim.id);
            // Handle specific transfer errors
            let errorCode = "TRANSFER_FAILED";
            let errorMessage = "Failed to transfer rewards. Please contact support.";
            if (transferError instanceof Error) {
                if (transferError.message.includes("insufficient funds")) {
                    errorCode = "INSUFFICIENT_FUNDS";
                    errorMessage =
                        "Rewards wallet has insufficient funds. Please contact support to resolve this issue.";
                } else if (transferError.message.includes("nonce")) {
                    errorCode = "NONCE_ERROR";
                    errorMessage =
                        "Transaction processing error. Please try again in a few moments.";
                } else if (transferError.message.includes("gas")) {
                    errorCode = "GAS_ESTIMATION_FAILED";
                    errorMessage =
                        "Unable to estimate transaction gas. Please try again.";
                }
            }
            return NextResponse.json(
                {
                    success: false,
                    error: "Reward transfer failed",
                    code: errorCode,
                    message: errorMessage,
                    details: {
                        claimId: pendingClaim.id,
                        amount: REWARD_AMOUNT_USD,
                    },
                    response_time_ms: Date.now() - start,
                },
                { status: 500 },
            );
        }
    } catch (err) {
        return NextResponse.json(
            {
                success: false,
                error: "Internal server error",
                code: "INTERNAL_ERROR",
                message:
                    "An unexpected error occurred while processing your referral claim. Please try again or contact support.",
                response_time_ms: Date.now() - start,
            },
            { status: 500 },
        );
    }
});