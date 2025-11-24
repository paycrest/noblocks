import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import { supabaseAdmin } from "@/app/lib/supabase";
import { fetchKYCStatus } from "@/app/api/aggregator";
import { getSmartWalletAddressFromPrivyUserId } from "@/app/lib/privy";
import { createWalletClient, createPublicClient, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { erc20Abi } from "viem";
import {
    trackApiRequest,
    trackApiResponse,
    trackApiError,
    trackBusinessEvent,
} from "@/app/lib/server-analytics";

// Referral configuration
const REWARD_AMOUNT_USD = 1.0;
const MIN_TX_VOLUME_USD = 100;
const DECIMALS = 6;

// Env vars (add to .env.local; use secrets in prod)
const CASHBACK_WALLET_PRIVATE_KEY = process.env.CASHBACK_WALLET_PRIVATE_KEY!; // Funding PK
const USDC_CONTRACT_ADDRESS = process.env.USDC_CONTRACT_ADDRESS || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // Base USDC
const RPC_URL = process.env.RPC_URL || "https://base-mainnet.g.alchemy.com/v2/YOUR_KEY"; // Base RPC

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
        // Resolve wallet address
        let walletAddress: string;
        try {
            walletAddress = await getSmartWalletAddressFromPrivyUserId(userId);
            if (!walletAddress) {
                throw new Error("No wallet found");
            }
        } catch (error) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Wallet resolution failed",
                    code: "WALLET_NOT_FOUND",
                    message: "Unable to resolve your wallet address. Please reconnect your wallet.",
                    response_time_ms: Date.now() - start,
                },
                { status: 400 },
            );
        }
        // Validate request body
        const contentType = request.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
            const body = await request.json().catch(() => null);
            if (body && typeof body.transactionId === "string") {
            }
        }
        if (!CASHBACK_WALLET_PRIVATE_KEY) {
            console.error("Referral funding wallet not configured");
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
        let referral;
        try {
            const { data, error } = await supabaseAdmin
                .from("referrals")
                .select("*")
                .eq("referred_wallet_address", walletAddress)
                .eq("status", "pending")
                .single();
            if (error && error.code !== "PGRST116") throw error;
            if (!data) {
                return NextResponse.json(
                    {
                        success: false,
                        error: "No pending referral",
                        code: "NO_PENDING_REFERRAL",
                        message: "No pending referral found for your wallet.",
                        response_time_ms: Date.now() - start,
                    },
                    { status: 404 },
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
        // Verify KYC for both referrer and referred
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
                        error: "KYC verification required",
                        code: "KYC_REQUIRED",
                        message: `KYC verification required for: ${missing.join(", ")}. Please complete KYC to claim rewards.`,
                        response_time_ms: Date.now() - start,
                    },
                    { status: 400 },
                );
            }
        } catch (error) {
            console.error("Failed to verify KYC:", error);
            return NextResponse.json(
                {
                    success: false,
                    error: "KYC verification failed",
                    code: "KYC_SERVICE_ERROR",
                    message: "Unable to verify KYC status. Please try again later.",
                    response_time_ms: Date.now() - start,
                },
                { status: 500 },
            );
        }
        // Verify transaction volume ($100 total)
        try {
            const { data: txs, error: txError } = await supabaseAdmin
                .from("transactions")
                .select("amount_usd, amount_received")
                .eq("wallet_address", walletAddress)
                .eq("status", "completed");
            if (txError) throw txError;
            if (!txs || txs.length === 0) {
                return NextResponse.json(
                    {
                        success: false,
                        error: "No completed transactions",
                        code: "NO_TRANSACTIONS",
                        message: "No completed transactions found. Complete $100 in volume to claim.",
                        response_time_ms: Date.now() - start,
                    },
                    { status: 400 },
                );
            }
            const totalUsd = txs.reduce((sum, tx) => sum + Number(tx.amount_usd || tx.amount_received || 0), 0);
            if (totalUsd < MIN_TX_VOLUME_USD) {
                return NextResponse.json(
                    {
                        success: false,
                        error: "Insufficient transaction volume",
                        code: "VOLUME_NOT_MET",
                        message: `Total transaction volume $${totalUsd.toFixed(2)} < $100 required. Complete more transactions to claim.`,
                        details: { currentVolume: totalUsd.toFixed(2), required: 100 },
                        response_time_ms: Date.now() - start,
                    },
                    { status: 400 },
                );
            }
        } catch (error) {
            console.error("Failed to check transaction volume:", error);
            return NextResponse.json(
                {
                    success: false,
                    error: "Transaction check failed",
                    code: "TX_VOLUME_ERROR",
                    message: "Unable to verify transaction volume. Please try again.",
                    response_time_ms: Date.now() - start,
                },
                { status: 500 },
            );
        }
        //Check for existing claim (idempotency)
        const { data: existingClaim } = await supabaseAdmin
            .from("referral_claims")
            .select("*")
            .eq("referral_id", referral.id)
            .single();
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
                walletAddress,
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
            if (
                !CASHBACK_WALLET_PRIVATE_KEY ||
                !CASHBACK_WALLET_PRIVATE_KEY.startsWith("0x") ||
                CASHBACK_WALLET_PRIVATE_KEY.length !== 66
            ) {
                throw new Error("Invalid private key format in configuration");
            }
            // Create wallet account from private key
            const account = privateKeyToAccount(CASHBACK_WALLET_PRIVATE_KEY as `0x${string}`);
            // Create wallet client
            const walletClient = createWalletClient({
                account,
                chain: base,
                transport: http(RPC_URL),
            });
            // Parse amount with proper decimals
            const amountInWei = parseUnits(REWARD_AMOUNT_USD.toString(), DECIMALS);
            // Execute transfer to referrer
            const referrerTxHash = await walletClient.writeContract({
                address: USDC_CONTRACT_ADDRESS as `0x${string}`,
                abi: erc20Abi,
                functionName: "transfer",
                args: [referral.referrer_wallet_address as `0x${string}`, amountInWei],
            });
            // Execute transfer to referred
            const referredTxHash = await walletClient.writeContract({
                address: USDC_CONTRACT_ADDRESS as `0x${string}`,
                abi: erc20Abi,
                functionName: "transfer",
                args: [walletAddress as `0x${string}`, amountInWei],
            });
            // Update claim status to completed
            const { error: updateError } = await supabaseAdmin
                .from("referral_claims")
                .update({
                    status: "completed",
                    tx_hash: referrerTxHash, // Or array if separate
                    updated_at: new Date().toISOString(),
                })
                .eq("id", pendingClaim.id);
            if (updateError) {
                console.error("Failed to update claim status:", updateError);
                console.error(
                    `MANUAL REVIEW NEEDED: Claim ${pendingClaim.id} transferred but status update failed`,
                );
            }
            return NextResponse.json({
                success: true,
                claim: {
                    amount: REWARD_AMOUNT_USD,
                    status: "completed",
                    txHashes: { referrer: referrerTxHash, referred: referredTxHash },
                },
                response_time_ms: Date.now() - start,
            });
        } catch (transferError) {
            console.error("Reward transfer failed:", transferError);
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
        console.error("Referral claim API error:", err);
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