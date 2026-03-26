import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import { supabaseAdmin } from "@/app/lib/supabase";
import { fetchKYCStatus } from "@/app/api/aggregator";
import {
  getPrivyUserIdFromRequest,
  getWalletAddressFromPrivyUserId,
} from "@/app/lib/privy";
import { getRpcUrl, FALLBACK_TOKENS } from "@/app/utils";
import { createWalletClient, createPublicClient, http, parseUnits, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { erc20Abi } from "viem";
import { cashbackConfig } from "@/app/lib/server-config";
import config from "@/app/lib/config";

// Referral program configuration
const referralRewardAmountUsd = config.referralRewardAmountUsd;
const referralMinQualifyingVolumeUsd = config.referralMinQualifyingVolumeUsd;

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
    return (
        error?.code === "23505" ||
        Boolean(error?.message?.toLowerCase().includes("duplicate")) ||
        Boolean(error?.message?.toLowerCase().includes("unique"))
    );
}

// ─── Shared result type ────────────────────────────────────────────────────────

type ClaimSuccess = { success: true; txHash: string; amount: number };
type ClaimFailure = { success: false; code: string; message: string };
type ClaimResult = ClaimSuccess | ClaimFailure;

// ─── Core claim logic (shared by GET auto-claim and POST manual claim) ─────────

/**
 * Verifies KYC + volume for the invitee, handles idempotency, and executes the
 * on-chain USDC transfer to `walletAddress` (caller EOA).
 * Volume is counted only from the date the referral code was entered.
 */
async function tryClaimOne(
  walletAddress: string,
  referral: Record<string, unknown>,
): Promise<ClaimResult> {
  const referralId = String(referral.id);
  const referralCreatedAt = new Date(String(referral.created_at)).toISOString();

  // Each party qualifies independently based on their OWN KYC + volume.
  // The referrer gets paid when they meet the requirements; the referred gets
  // paid when they meet the requirements — neither blocks the other.
  const qualifyingWallet = walletAddress.toLowerCase();

  // ── KYC check (caller's own KYC) ───────────────────────────────────────────
  const kyc = await fetchKYCStatus(qualifyingWallet);
  if (kyc?.data?.status !== "verified") {
    return {
      success: false,
      code: "KYC_REQUIRED",
      message: "You must complete KYC verification before claiming your referral reward.",
    };
  }

  // ── Volume check — caller's own txs from the day the code was applied ───────
  const { data: volTxs, error: volTxError } = await supabaseAdmin
    .from("transactions")
    .select("amount_sent, from_currency")
    .eq("wallet_address", qualifyingWallet)
    .eq("status", "completed")
    .gte("created_at", referralCreatedAt);

  if (volTxError) {
    return {
      success: false,
      code: "VERIFICATION_ERROR",
      message: `Failed to fetch transactions: ${volTxError.message}`,
    };
  }

  // USD-pegged stables count 1:1; cNGN requires conversion via the NGN/USD rate.
  const USD_STABLE = new Set(["USDC", "USDT"]);
  const CNGN_SYMBOLS = new Set(["cNGN", "CNGN"]);

  const txList = (volTxs || []) as Array<{ amount_sent: string | number; from_currency: string }>;
  const hasCngn = txList.some((tx) => CNGN_SYMBOLS.has(tx.from_currency));

  // Fetch NGN → USD rate only when needed (1 USD = rate NGN).
  let ngnPerUsd: number | null = null;
  if (hasCngn) {
    try {
      const rateUrl = `${process.env.NEXT_PUBLIC_AGGREGATOR_URL}/rates/USDC/1/NGN`;
      const rateRes = await fetch(rateUrl);
      const rateJson = await rateRes.json() as { data?: string };
      const parsed = Number(rateJson?.data);
      if (parsed > 0) ngnPerUsd = parsed;
    } catch {
      // If rate fetch fails, cNGN txs will be skipped (counted as 0).
    }
  }

  const totalUsd = txList.reduce((sum, tx) => {
    const amount = Number(tx.amount_sent ?? 0);
    if (USD_STABLE.has(tx.from_currency)) {
      return sum + amount;
    }
    if (CNGN_SYMBOLS.has(tx.from_currency) && ngnPerUsd && ngnPerUsd > 0) {
      return sum + amount / ngnPerUsd;
    }
    // Other currencies: skip (not yet supported for volume calculation).
    return sum;
  }, 0);

  if (totalUsd < referralMinQualifyingVolumeUsd) {
    return {
      success: false,
      code: "VOLUME_NOT_MET",
      message: `Your transaction volume $${totalUsd.toFixed(2)} is less than the required $${referralMinQualifyingVolumeUsd}.`,
    };
  }

  // ── Idempotency ─────────────────────────────────────────────────────────────
  const { data: existingClaim, error: existingClaimError } = await supabaseAdmin
    .from("referral_claims")
    .select("*")
    .eq("referral_id", referralId)
    .eq("wallet_address", walletAddress)
    .maybeSingle();

  if (existingClaimError && existingClaimError.code !== "PGRST116") {
    return {
      success: false,
      code: "CLAIM_LOOKUP_FAILED",
      message: "Unable to verify existing referral claim.",
    };
  }

  if (existingClaim?.status === "completed") {
    return {
      success: true,
      txHash: existingClaim.tx_hash,
      amount: existingClaim.reward_amount,
    };
  }

  let pendingClaimRow: typeof existingClaim;

  if (existingClaim?.status === "pending") {
    pendingClaimRow = existingClaim;
  } else if (existingClaim?.status === "failed") {
    const { data: retried, error: retryErr } = await supabaseAdmin
      .from("referral_claims")
      .update({ status: "pending", tx_hash: null, updated_at: new Date().toISOString() })
      .eq("id", existingClaim.id)
      .select()
      .single();
    if (retryErr || !retried) {
      return { success: false, code: "CLAIM_RETRY_FAILED", message: "Unable to retry this claim." };
    }
    pendingClaimRow = retried;
  } else {
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("referral_claims")
      .insert({
        referral_id: referralId,
        wallet_address: walletAddress,
        reward_amount: referralRewardAmountUsd,
        status: "pending",
      })
      .select()
      .single();

    if (insertError && isUniqueViolation(insertError)) {
      const { data: raced, error: raceErr } = await supabaseAdmin
        .from("referral_claims")
        .select("*")
        .eq("referral_id", referralId)
        .eq("wallet_address", walletAddress)
        .single();
      if (raceErr || !raced) {
        return { success: false, code: "CLAIM_CONFLICT", message: "Unable to resolve claim row." };
      }
      if (raced.status === "completed") {
        return { success: true, txHash: raced.tx_hash, amount: raced.reward_amount };
      }
      if (raced.status === "failed") {
        const { data: reopened, error: reopenErr } = await supabaseAdmin
          .from("referral_claims")
          .update({ status: "pending", tx_hash: null, updated_at: new Date().toISOString() })
          .eq("id", raced.id)
          .select()
          .single();
        if (reopenErr || !reopened) {
          return { success: false, code: "CLAIM_RETRY_FAILED", message: "Unable to retry this claim." };
        }
        pendingClaimRow = reopened;
      } else {
        pendingClaimRow = raced;
      }
    } else if (insertError || !inserted) {
      return { success: false, code: "CLAIM_CREATION_FAILED", message: "Unable to create claim record." };
    } else {
      pendingClaimRow = inserted;
    }
  }

  const pendingClaim = pendingClaimRow!;

  // ── On-chain transfer ───────────────────────────────────────────────────────
  try {
    const privateKey = cashbackConfig.walletPrivateKey;
    if (!privateKey || !privateKey.startsWith("0x") || privateKey.length !== 66) {
      return { success: false, code: "INVALID_PRIVATE_KEY", message: "Invalid private key format in configuration." };
    }

    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const sendingWalletAddress = account.address;

    if (
      cashbackConfig.walletAddress &&
      cashbackConfig.walletAddress.toLowerCase() !== sendingWalletAddress.toLowerCase()
    ) {
      return {
        success: false,
        code: "WALLET_ADDRESS_MISMATCH",
        message: "Configured wallet address does not match the private key.",
      };
    }

    const rpcUrl = getRpcUrl("Base");
    if (!rpcUrl) {
      return { success: false, code: "RPC_NOT_CONFIGURED", message: "Base RPC not configured." };
    }

    const usdcToken = FALLBACK_TOKENS["Base"]?.find((t) => t.symbol === "USDC");
    if (!usdcToken) {
      return { success: false, code: "TOKEN_NOT_FOUND", message: "USDC token not found on Base." };
    }

    const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
    const walletClient = createWalletClient({ account, chain: base, transport: http(rpcUrl) });
    const amountInWei = parseUnits(referralRewardAmountUsd.toString(), usdcToken.decimals);

    const currentBalance = await publicClient.readContract({
      address: usdcToken.address as `0x${string}`,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [sendingWalletAddress as `0x${string}`],
    });

    if (currentBalance < amountInWei) {
      const available = parseFloat(formatUnits(currentBalance, usdcToken.decimals));
      return {
        success: false,
        code: "INSUFFICIENT_BALANCE",
        message: `Insufficient USDC. Required: $${referralRewardAmountUsd.toFixed(2)}, Available: $${available.toFixed(2)}`,
      };
    }

    const txHash = await walletClient.writeContract({
      address: usdcToken.address as `0x${string}`,
      abi: erc20Abi,
      functionName: "transfer",
      args: [walletAddress as `0x${string}`, amountInWei],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 1 });

    if (receipt.status !== "success") {
      await supabaseAdmin
        .from("referral_claims")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", pendingClaim.id);
      return { success: false, code: "TRANSFER_REVERTED", message: "The USDC transfer was reverted on-chain." };
    }

    await supabaseAdmin
      .from("referral_claims")
      .update({ status: "completed", tx_hash: txHash, updated_at: new Date().toISOString() })
      .eq("id", pendingClaim.id);

    const { error: referralStatusError } = await supabaseAdmin
      .from("referrals")
      .update({ status: "earned", updated_at: new Date().toISOString() })
      .eq("id", referralId);

    if (referralStatusError) {
      console.error(`MANUAL REVIEW NEEDED: Referral ${referralId} was paid out but status update failed`);
    }

    return { success: true, txHash, amount: referralRewardAmountUsd };
  } catch (err) {
    await supabaseAdmin
      .from("referral_claims")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", pendingClaim.id);

    let code = "TRANSFER_FAILED";
    let message = "Failed to transfer rewards. Please contact support.";
    if (err instanceof Error) {
      if (err.message.includes("insufficient funds")) {
        code = "INSUFFICIENT_FUNDS";
        message = "Rewards wallet has insufficient funds. Please contact support.";
      } else if (err.message.includes("nonce")) {
        code = "NONCE_ERROR";
        message = "Transaction processing error. Please try again in a few moments.";
      } else if (err.message.includes("gas")) {
        code = "GAS_ESTIMATION_FAILED";
        message = "Unable to estimate gas. Please try again.";
      }
    }
    return { success: false, code, message };
  }
}

// ─── GET — auto-claim all eligible pending referrals ─────────────────────────
//
// Called automatically when the referral dashboard loads. The server checks
// KYC + volume (from referral created_at) for every pending referral and pays
// out any that qualify. Silent skips for KYC_REQUIRED / VOLUME_NOT_MET are
// expected until the invitee meets requirements.

export const GET = withRateLimit(async (request: NextRequest) => {
  const start = Date.now();
  try {
    const userId = await getPrivyUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized", code: "AUTH_REQUIRED", response_time_ms: Date.now() - start },
        { status: 401 },
      );
    }

    const walletAddress = await getWalletAddressFromPrivyUserId(userId);

    if (!cashbackConfig.walletPrivateKey) {
      return NextResponse.json(
        { success: false, error: "Referral service not configured", code: "SERVICE_UNAVAILABLE", response_time_ms: Date.now() - start },
        { status: 503 },
      );
    }

    // Find all referrals (pending OR earned) where the user is the referrer OR the
    // referred party. We include "earned" because the first party to claim flips the
    // referral to "earned", but the second party still hasn't been paid yet.
    // Per-wallet idempotency is enforced in tryClaimOne via referral_claims.
    const { data: pendingReferrals, error: fetchError } = await supabaseAdmin
      .from("referrals")
      .select("*")
      .in("status", ["pending", "earned"])
      .or(
        `referrer_wallet_address.eq.${walletAddress},referred_wallet_address.eq.${walletAddress}`,
      );

    if (fetchError) {
      return NextResponse.json(
        { success: false, error: "Failed to fetch referrals", code: "DATABASE_ERROR", response_time_ms: Date.now() - start },
        { status: 500 },
      );
    }

    if (!pendingReferrals || pendingReferrals.length === 0) {
      return NextResponse.json({
        success: true,
        claimed: 0,
        skipped: 0,
        results: [],
        response_time_ms: Date.now() - start,
      });
    }

    const results: Array<{ referralId: string } & ClaimResult> = [];
    let claimed = 0;
    let skipped = 0;

    for (const referral of pendingReferrals) {
      const result = await tryClaimOne(walletAddress, referral as Record<string, unknown>);
      results.push({ referralId: String(referral.id), ...result });
      if (result.success) claimed++;
      else skipped++;
    }

    return NextResponse.json({
      success: true,
      claimed,
      skipped,
      results,
      response_time_ms: Date.now() - start,
    });
  } catch (err) {
    console.error("Auto-claim error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error", code: "INTERNAL_ERROR", response_time_ms: Date.now() - start },
      { status: 500 },
    );
  }
});

// ─── POST — manual claim for a specific referralId ────────────────────────────

export const POST = withRateLimit(async (request: NextRequest) => {
  const start = Date.now();
  try {
    const userId = await getPrivyUserIdFromRequest(request);
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

    const walletAddress = await getWalletAddressFromPrivyUserId(userId);

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

    // Fetch the specific referral and validate ownership.
    // Allow "earned" too — the first party claiming flips it to "earned" but the
    // second party (referrer or referred) hasn't been paid yet.
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

    const isReferrer =
      String(data.referrer_wallet_address).toLowerCase() === walletAddress.toLowerCase();
    const isReferred =
      String(data.referred_wallet_address).toLowerCase() === walletAddress.toLowerCase();

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

    const result = await tryClaimOne(walletAddress, data as Record<string, unknown>);

    if (!result.success) {
      const statusCode =
        result.code === "KYC_REQUIRED" || result.code === "VOLUME_NOT_MET"
          ? 400
          : result.code === "INSUFFICIENT_BALANCE" || result.code === "SERVICE_UNAVAILABLE"
            ? 503
            : result.code === "UNAUTHORIZED_REFERRAL"
              ? 403
              : 500;

      return NextResponse.json(
        {
          success: false,
          error: result.message,
          code: result.code,
          message: result.message,
          response_time_ms: Date.now() - start,
        },
        { status: statusCode },
      );
    }

    return NextResponse.json({
      success: true,
      claim: {
        amount: result.amount,
        status: "completed",
        txHash: result.txHash,
      },
      response_time_ms: Date.now() - start,
    });
  } catch (err) {
    console.error("Manual claim error:", err);
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
