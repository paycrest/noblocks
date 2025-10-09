import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import { cashbackConfig } from "@/app/lib/server-config";
import { FALLBACK_TOKENS, getRpcUrl } from "@/app/utils";
import { createWalletClient, createPublicClient, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { erc20Abi } from "viem";
import { supabaseAdmin } from "@/app/lib/supabase";
import { fetchOrderDetails } from "@/app/api/aggregator";

// Campaign configuration
const BLOCKFEST_END_DATE = new Date(
  process.env.NEXT_PUBLIC_BLOCKFEST_END_DATE || "2025-10-11T23:59:00+01:00",
);
const MAX_CASHBACK_PER_TRANSACTION = 100; // $100 max per transaction
const MAX_CASHBACK_PER_WALLET = 500; // $500 total per wallet
const MAX_CLAIMS_PER_WALLET = 10; // 10 claims max per wallet
const CASHBACK_PERCENTAGE = 0.01; // 1% cashback

// POST /api/blockfest/cashback
// Body: { transactionId: string }
export const POST = withRateLimit(async (request: NextRequest) => {
  const start = Date.now();

  try {
    // Step 1: Authentication - Get wallet address from middleware header
    const walletAddress = request.headers
      .get("x-wallet-address")
      ?.toLowerCase();

    if (!walletAddress) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
          code: "AUTH_REQUIRED",
          message: "Authentication required. Please sign in to claim cashback.",
          response_time_ms: Date.now() - start,
        },
        { status: 401 },
      );
    }

    // Step 2: Validate request body
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

    if (!body || typeof body.transactionId !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body",
          code: "MISSING_TRANSACTION_ID",
          message: "transactionId is required in request body",
          response_time_ms: Date.now() - start,
        },
        { status: 400 },
      );
    }

    const { transactionId } = body;

    // Step 3: Check cashback wallet configuration
    if (!cashbackConfig.walletAddress || !cashbackConfig.walletPrivateKey) {
      console.error("Cashback wallet not configured");
      return NextResponse.json(
        {
          success: false,
          error: "Cashback service not configured",
          code: "SERVICE_UNAVAILABLE",
          message:
            "Cashback service is temporarily unavailable. Please try again later or contact support.",
          response_time_ms: Date.now() - start,
        },
        { status: 500 },
      );
    }

    // Step 4: Fetch transaction details from aggregator
    let orderDetails;
    try {
      // Extract chainId from transactionId if needed (format: chainId-orderId)
      const parts = transactionId.split("-");
      const chainId = parts.length > 1 ? parseInt(parts[0]) : 8453; // Default to Base (8453)
      const orderId =
        parts.length > 1 ? parts.slice(1).join("-") : transactionId;

      const orderResponse = await fetchOrderDetails(chainId, orderId);
      orderDetails = orderResponse.data;
    } catch (error) {
      console.error("Failed to fetch transaction:", error);
      return NextResponse.json(
        {
          success: false,
          error: "Transaction not found",
          code: "TRANSACTION_NOT_FOUND",
          message: `No transaction found with ID: ${transactionId}. Please verify the transaction ID and try again.`,
          response_time_ms: Date.now() - start,
        },
        { status: 404 },
      );
    }

    // Step 4.5: Verify transaction ownership via blockchain
    try {
      const rpcUrl = getRpcUrl("Base");
      if (!rpcUrl) {
        throw new Error("Base RPC not configured");
      }

      const publicClient = createPublicClient({
        chain: base,
        transport: http(rpcUrl),
      });

      const txData = await publicClient.getTransaction({
        hash: orderDetails.txHash as `0x${string}`,
      });

      // Verify the transaction sender matches the authenticated wallet
      if (txData.from.toLowerCase() !== walletAddress) {
        return NextResponse.json(
          {
            success: false,
            error: "Transaction ownership verification failed",
            code: "NOT_TRANSACTION_OWNER",
            message:
              "You can only claim cashback for your own transactions. This transaction belongs to a different wallet.",
            details: {
              transactionId,
              txHash: orderDetails.txHash,
            },
            response_time_ms: Date.now() - start,
          },
          { status: 403 },
        );
      }
    } catch (error) {
      console.error("Failed to verify transaction ownership:", error);
      return NextResponse.json(
        {
          success: false,
          error: "Transaction verification failed",
          code: "VERIFICATION_ERROR",
          message:
            "Unable to verify transaction ownership. Please try again or contact support.",
          response_time_ms: Date.now() - start,
        },
        { status: 500 },
      );
    }

    // Step 5: Verify transaction is eligible
    // Check status
    if (orderDetails.status !== "settled") {
      return NextResponse.json(
        {
          success: false,
          error: "Transaction not eligible",
          code: "TRANSACTION_NOT_SETTLED",
          message: `Transaction must be settled to claim cashback. Current status: ${orderDetails.status}`,
          details: {
            transactionId,
            currentStatus: orderDetails.status,
            requiredStatus: "settled",
          },
          response_time_ms: Date.now() - start,
        },
        { status: 400 },
      );
    }

    // Check network
    if (orderDetails.network !== "Base") {
      return NextResponse.json(
        {
          success: false,
          error: "Network not supported",
          code: "INVALID_NETWORK",
          message: `Cashback is only available for transactions on Base network. Your transaction is on ${orderDetails.network}.`,
          details: {
            transactionId,
            transactionNetwork: orderDetails.network,
            supportedNetwork: "Base",
          },
          response_time_ms: Date.now() - start,
        },
        { status: 400 },
      );
    }

    // Check campaign period
    const transactionDate = new Date(orderDetails.updatedAt);
    if (transactionDate > BLOCKFEST_END_DATE) {
      return NextResponse.json(
        {
          success: false,
          error: "Transaction outside campaign period",
          code: "CAMPAIGN_ENDED",
          message: `This transaction occurred after the BlockFest campaign ended (${BLOCKFEST_END_DATE.toISOString()}).`,
          details: {
            transactionId,
            transactionDate: orderDetails.updatedAt,
            campaignEndDate: BLOCKFEST_END_DATE.toISOString(),
          },
          response_time_ms: Date.now() - start,
        },
        { status: 400 },
      );
    }

    // Step 6: Verify user is BlockFest participant
    const { data: participant, error: participantError } = await supabaseAdmin
      .from("blockfest_participants")
      .select("*")
      .eq("normalized_address", walletAddress)
      .single();

    if (participantError || !participant) {
      return NextResponse.json(
        {
          success: false,
          error: "Not a BlockFest participant",
          code: "NOT_A_PARTICIPANT",
          message:
            "You must join BlockFest with a referral link (?ref=blockfest) to be eligible for cashback.",
          response_time_ms: Date.now() - start,
        },
        { status: 403 },
      );
    }

    // Step 7: Check for existing claim (idempotency)
    const { data: existingClaim } = await supabaseAdmin
      .from("blockfest_cashback_claims")
      .select("*")
      .eq("transaction_id", transactionId)
      .single();

    if (existingClaim) {
      // Return existing claim info
      return NextResponse.json({
        success: existingClaim.status === "completed",
        message: `Cashback already ${existingClaim.status}`,
        claim: {
          amount: existingClaim.amount,
          tokenType: existingClaim.token_type,
          status: existingClaim.status,
          txHash: existingClaim.tx_hash,
        },
        response_time_ms: Date.now() - start,
      });
    }

    // Step 8: Calculate cashback amount (server-side)
    const transactionAmount = parseFloat(orderDetails.amount);
    const cashbackAmount = transactionAmount * CASHBACK_PERCENTAGE;
    const cappedCashback = Math.min(
      cashbackAmount,
      MAX_CASHBACK_PER_TRANSACTION,
    );
    const finalCashback = cappedCashback.toFixed(2);

    // Step 9: Check per-wallet limits
    // Check total claim count
    const { count: claimCount, error: countError } = await supabaseAdmin
      .from("blockfest_cashback_claims")
      .select("*", { count: "exact", head: true })
      .eq("wallet_address", walletAddress)
      .eq("status", "completed");

    if (countError) {
      console.error("Failed to check claim count:", countError);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to verify claim limits",
          code: "DATABASE_ERROR",
          message: "Unable to verify your claim eligibility. Please try again.",
          response_time_ms: Date.now() - start,
        },
        { status: 500 },
      );
    }

    if ((claimCount || 0) >= MAX_CLAIMS_PER_WALLET) {
      return NextResponse.json(
        {
          success: false,
          error: "Claim limit reached",
          code: "MAX_CLAIMS_REACHED",
          message: `You have reached the maximum of ${MAX_CLAIMS_PER_WALLET} cashback claims per wallet for this campaign.`,
          details: {
            currentClaims: claimCount,
            maxClaims: MAX_CLAIMS_PER_WALLET,
          },
          response_time_ms: Date.now() - start,
        },
        { status: 429 },
      );
    }

    // Check total amount claimed
    const { data: completedClaims, error: claimsError } = await supabaseAdmin
      .from("blockfest_cashback_claims")
      .select("amount")
      .eq("wallet_address", walletAddress)
      .eq("status", "completed");

    if (claimsError) {
      console.error("Failed to check total claimed:", claimsError);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to verify claim limits",
          code: "DATABASE_ERROR",
          message: "Unable to verify your claim eligibility. Please try again.",
          response_time_ms: Date.now() - start,
        },
        { status: 500 },
      );
    }

    const totalClaimed = (completedClaims || []).reduce(
      (sum, claim) => sum + parseFloat(claim.amount),
      0,
    );

    if (totalClaimed >= MAX_CASHBACK_PER_WALLET) {
      return NextResponse.json(
        {
          success: false,
          error: "Total cashback limit reached",
          code: "MAX_CASHBACK_REACHED",
          message: `You have reached the maximum total cashback of $${MAX_CASHBACK_PER_WALLET} per wallet for this campaign.`,
          details: {
            totalClaimed: totalClaimed.toFixed(2),
            maxCashback: MAX_CASHBACK_PER_WALLET,
          },
          response_time_ms: Date.now() - start,
        },
        { status: 429 },
      );
    }

    // Check if adding this claim would exceed limit
    if (totalClaimed + parseFloat(finalCashback) > MAX_CASHBACK_PER_WALLET) {
      // Adjust cashback to fit within limit
      const remainingAllowance = MAX_CASHBACK_PER_WALLET - totalClaimed;
      if (remainingAllowance <= 0) {
        return NextResponse.json(
          {
            success: false,
            error: "Total cashback limit reached",
            code: "MAX_CASHBACK_REACHED",
            message: `You have reached the maximum total cashback of $${MAX_CASHBACK_PER_WALLET} per wallet for this campaign.`,
            details: {
              totalClaimed: totalClaimed.toFixed(2),
              maxCashback: MAX_CASHBACK_PER_WALLET,
              remainingAllowance: "0.00",
            },
            response_time_ms: Date.now() - start,
          },
          { status: 429 },
        );
      }
      // Note: We'll use finalCashback as calculated, or could adjust here
    }

    // Step 10: Create pending claim record
    const { data: pendingClaim, error: claimError } = await supabaseAdmin
      .from("blockfest_cashback_claims")
      .insert({
        transaction_id: transactionId,
        wallet_address: walletAddress,
        amount: finalCashback,
        token_type: orderDetails.token,
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
          message:
            claimError?.code === "23505"
              ? "A claim for this transaction already exists. Please refresh and try again."
              : "Unable to process your cashback claim. Please try again.",
          details: claimError?.message
            ? { dbError: claimError.message }
            : undefined,
          response_time_ms: Date.now() - start,
        },
        { status: 500 },
      );
    }

    // Step 11: Execute cashback transfer
    try {
      // Get token contract address
      const baseTokens = FALLBACK_TOKENS["Base"];
      const token = baseTokens.find((t) => t.symbol === orderDetails.token);

      if (!token) {
        throw new Error(`Token ${orderDetails.token} not found on Base`);
      }

      // Get RPC URL
      const rpcUrl = getRpcUrl("Base");
      if (!rpcUrl) {
        throw new Error("Base RPC not configured");
      }

      // Create wallet account from private key
      const account = privateKeyToAccount(
        cashbackConfig.walletPrivateKey as `0x${string}`,
      );

      // Create wallet client
      const walletClient = createWalletClient({
        account,
        chain: base,
        transport: http(rpcUrl),
      });

      // Parse amount with proper decimals
      const amountInWei = parseUnits(finalCashback, token.decimals);

      // Execute transfer
      const txHash = await walletClient.writeContract({
        address: token.address as `0x${string}`,
        abi: erc20Abi,
        functionName: "transfer",
        args: [walletAddress as `0x${string}`, amountInWei],
      });

      // Step 12: Update claim status to completed
      const { error: updateError } = await supabaseAdmin
        .from("blockfest_cashback_claims")
        .update({
          status: "completed",
          tx_hash: txHash,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pendingClaim.id);

      if (updateError) {
        console.error("Failed to update claim status:", updateError);
        // Transfer succeeded but status update failed - log for manual review
        console.error(
          `MANUAL REVIEW NEEDED: Claim ${pendingClaim.id} transferred but status update failed`,
        );
      }

      return NextResponse.json({
        success: true,
        claim: {
          amount: finalCashback,
          tokenType: orderDetails.token,
          txHash,
          status: "completed",
        },
        response_time_ms: Date.now() - start,
      });
    } catch (transferError) {
      console.error("Cashback transfer failed:", transferError);

      // Update claim status to failed
      await supabaseAdmin
        .from("blockfest_cashback_claims")
        .update({
          status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", pendingClaim.id);

      // Handle specific transfer errors
      let errorCode = "TRANSFER_FAILED";
      let errorMessage = "Failed to transfer cashback. Please contact support.";

      if (transferError instanceof Error) {
        if (transferError.message.includes("insufficient funds")) {
          errorCode = "INSUFFICIENT_FUNDS";
          errorMessage =
            "Cashback wallet has insufficient funds. Please contact support to resolve this issue.";
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
          error: "Cashback transfer failed",
          code: errorCode,
          message: errorMessage,
          details: {
            claimId: pendingClaim.id,
            amount: finalCashback,
            tokenType: orderDetails.token,
          },
          response_time_ms: Date.now() - start,
        },
        { status: 500 },
      );
    }
  } catch (err) {
    console.error("BlockFest cashback API error:", err);

    const message =
      err instanceof Error && err.message
        ? err.message
        : "An unexpected error occurred";

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        code: "INTERNAL_ERROR",
        message:
          "An unexpected error occurred while processing your cashback claim. Please try again or contact support.",
        details:
          process.env.NODE_ENV === "development"
            ? { originalError: message }
            : undefined,
        response_time_ms: Date.now() - start,
      },
      { status: 500 },
    );
  }
});
