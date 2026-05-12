import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { getKycMonthlyLimitsRecord } from "@/app/lib/kyc-tier-limits";
import { collectLinkedEvmAddressesForPrivyUserId } from "@/app/lib/privy";

export type SwapLimitRpcBody = {
  transactionType: string;
  fromCurrency: string;
  toCurrency: string;
  amountSent: unknown;
  amountReceived: unknown;
  fee: unknown;
  recipient: unknown;
  status: string;
  network?: unknown;
  time_spent?: unknown;
  txHash?: unknown;
  orderId?: unknown;
};

export type TransactionWalletAuthFailureReason =
  | "missing_user_context"
  | "wallet_mismatch"
  | "privy_lookup_failed";

export async function assertTransactionWalletAuthorized(
  request: NextRequest,
  headerWalletAddress: string,
  normalizedBodyWalletAddress: string,
): Promise<
  | { ok: true }
  | {
      ok: false;
      response: NextResponse;
      reason: TransactionWalletAuthFailureReason;
    }
> {
  if (normalizedBodyWalletAddress !== headerWalletAddress) {
    const privyUserId = request.headers.get("x-user-id");
    if (!privyUserId) {
      return {
        ok: false,
        reason: "missing_user_context",
        response: NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 },
        ),
      };
    }
    try {
      const linked = await collectLinkedEvmAddressesForPrivyUserId(privyUserId);
      if (!linked.includes(normalizedBodyWalletAddress)) {
        return {
          ok: false,
          reason: "wallet_mismatch",
          response: NextResponse.json(
            {
              success: false,
              error: "Unauthorized: Wallet address mismatch",
            },
            { status: 403 },
          ),
        };
      }
    } catch (e) {
      console.error(
        "Privy linked-address resolution for transaction wallet check:",
        e,
      );
      return {
        ok: false,
        reason: "privy_lookup_failed",
        response: NextResponse.json(
          {
            success: false,
            error: "Unable to verify wallet ownership. Please try again.",
          },
          { status: 503 },
        ),
      };
    }
  }

  return { ok: true };
}

export type SwapLimitCheckResult =
  | { kind: "success"; id?: string; monthlyLimit: number }
  | { kind: "rate_unavailable" }
  | { kind: "limit_exceeded"; monthlyLimit: number }
  | { kind: "kyc_required" }
  | { kind: "kyc_db_error" }
  | { kind: "rpc_failed"; error: unknown }
  | { kind: "unexpected_rpc" };

/**
 * KYC tier lookup, optional cNGN rate fetch, and atomic insert_swap_transaction_if_within_limit.
 * When dryRun is true, the RPC verifies spend without inserting (p_dry_run).
 */
export async function executeSwapTransactionLimitCheck(
  normalizedBodyWalletAddress: string,
  body: SwapLimitRpcBody,
  options: {
    dryRun: boolean;
    explorerLink: string | null;
    normalizedEmail: string | null;
  },
): Promise<SwapLimitCheckResult> {
  const KYC_MONTHLY_LIMITS = getKycMonthlyLimitsRecord();
  const kycWalletAddress = normalizedBodyWalletAddress;

  const { data: kycProfile, error: kycError } = await supabaseAdmin
    .from("user_kyc_profiles")
    .select("tier")
    .eq("wallet_address", kycWalletAddress)
    .maybeSingle();

  if (kycError) {
    return { kind: "kyc_db_error" };
  }

  const tier = Math.min(Math.max(Number(kycProfile?.tier ?? 0), 0), 3);
  const monthlyLimit = KYC_MONTHLY_LIMITS[tier] ?? 0;

  if (monthlyLimit === 0) {
    return { kind: "kyc_required" };
  }

  let cngnToUsdRate = 0;
  try {
    const aggregatorUrl = process.env.NEXT_PUBLIC_AGGREGATOR_URL;
    if (aggregatorUrl) {
      const rateRes = await fetch(`${aggregatorUrl}/rates/USDC/1/NGN`, {
        signal: AbortSignal.timeout(5000),
      });
      if (rateRes.ok) {
        const rateData = await rateRes.json();
        const rate = Number(rateData?.data);
        if (rate > 0) cngnToUsdRate = rate;
      }
    }
  } catch {
    // Rate unavailable — stored procedure will return rate_unavailable if cNGN is involved
  }

  const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
    "insert_swap_transaction_if_within_limit",
    {
      p_wallet_address: normalizedBodyWalletAddress,
      p_monthly_limit: monthlyLimit,
      p_cngn_to_usd_rate: cngnToUsdRate,
      p_transaction_type: body.transactionType,
      p_from_currency: body.fromCurrency,
      p_to_currency: body.toCurrency,
      p_amount_sent: parseFloat(String(body.amountSent)) || 0,
      p_amount_received: parseFloat(String(body.amountReceived)) || 0,
      p_fee: parseFloat(String(body.fee)) || 0,
      p_recipient: body.recipient,
      p_status: body.status,
      p_network: (body.network as string | undefined) || null,
      p_time_spent: (body.time_spent as string | undefined) || null,
      p_tx_hash: (body.txHash as string | undefined) || null,
      p_order_id: (body.orderId as string | undefined) || null,
      p_email: options.normalizedEmail,
      p_explorer_link: options.explorerLink || null,
      p_dry_run: options.dryRun,
    },
  );

  if (rpcError) {
    return { kind: "rpc_failed", error: rpcError };
  }

  const rpcData = rpcResult as {
    id?: string;
    error?: string;
    ok?: boolean;
  };

  if (rpcData.error === "rate_unavailable") {
    return { kind: "rate_unavailable" };
  }

  if (rpcData.error === "limit_exceeded") {
    return { kind: "limit_exceeded", monthlyLimit };
  }

  if (options.dryRun) {
    if (rpcData.ok === true) {
      return { kind: "success", monthlyLimit };
    }
    return { kind: "unexpected_rpc" };
  }

  if (!rpcData.id) {
    return { kind: "unexpected_rpc" };
  }

  return { kind: "success", id: rpcData.id, monthlyLimit };
}
