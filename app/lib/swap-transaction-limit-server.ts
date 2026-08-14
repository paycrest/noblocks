import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { getKycTierLimit } from "@/app/lib/kyc-tier-limits";
import { resolveIdentityScope } from "@/app/lib/kyc-identity";
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

/** NGN per 1 USDC from the aggregator (used for cNGN / fiat KYC limit math). */
const KYC_RATE_NETWORK_FALLBACKS = [
  "solana-mainnet-beta",
  "base",
  "arbitrum-one",
  "polygon",
] as const;

function aggregatorOriginForV2(): string | null {
  const raw = process.env.NEXT_PUBLIC_AGGREGATOR_URL?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const basePath = parsed.pathname
      .replace(/\/v1\/?$/i, "")
      .replace(/\/$/, "");
    return `${parsed.origin}${basePath}`;
  } catch {
    return null;
  }
}

function normalizeRateNetworkSlug(network?: string | null): string | null {
  const trimmed = String(network ?? "").trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed.replace(/\s+/g, "-");
}

function parseV1RatePayload(payload: { data?: unknown } | null): number {
  const rate = Number(payload?.data);
  return Number.isFinite(rate) && rate > 0 ? rate : 0;
}

function parseV2SellRatePayload(payload: { data?: unknown } | null): number {
  const sell = (payload?.data as { sell?: { rate?: unknown } } | undefined)
    ?.sell;
  const rate = Number(sell?.rate);
  return Number.isFinite(rate) && rate > 0 ? rate : 0;
}

/**
 * Resolves USDC/NGN for monthly limit checks. Staging requires a network slug
 * (same as solanatool / UI v2 quotes); production v1 without network still works.
 */
export async function fetchCngnToUsdRate(
  networkSlug?: string | null,
): Promise<number> {
  const raw = process.env.NEXT_PUBLIC_AGGREGATOR_URL?.trim();
  if (!raw) {
    console.warn(
      "swap limit check: NEXT_PUBLIC_AGGREGATOR_URL is not set; rate-dependent KYC checks may fail",
    );
    return 0;
  }

  const v1Base = raw.replace(/\/+$/, "");
  const primary = normalizeRateNetworkSlug(networkSlug);
  const networksToTry = [
    ...(primary ? [primary] : []),
    ...KYC_RATE_NETWORK_FALLBACKS.filter((slug) => slug !== primary),
  ];

  for (const network of networksToTry) {
    const v1Url = `${v1Base}/rates/USDC/1/NGN?network=${encodeURIComponent(network)}`;
    try {
      const rateRes = await fetch(v1Url, {
        signal: AbortSignal.timeout(5000),
      });
      const rateData = (await rateRes.json().catch(() => null)) as
        | { status?: string; data?: unknown }
        | null;
      if (rateRes.ok && rateData?.status === "success") {
        const rate = parseV1RatePayload(rateData);
        if (rate > 0) return rate;
      }
    } catch (error) {
      console.warn(
        `swap limit check: v1 rate fetch failed for ${network}:`,
        error,
      );
    }

    const origin = aggregatorOriginForV2();
    if (origin) {
      const v2Url = `${origin}/v2/rates/${encodeURIComponent(network)}/USDC/1/NGN?side=sell`;
      try {
        const rateRes = await fetch(v2Url, {
          signal: AbortSignal.timeout(5000),
        });
        const rateData = (await rateRes.json().catch(() => null)) as
          | { status?: string; data?: unknown }
          | null;
        if (rateRes.ok && rateData?.status === "success") {
          const rate = parseV2SellRatePayload(rateData);
          if (rate > 0) return rate;
        }
      } catch (error) {
        console.warn(
          `swap limit check: v2 sell rate fetch failed for ${network}:`,
          error,
        );
      }
    }
  }

  // Legacy prod path: network-agnostic v1 (404 on staging when no EVM provider).
  const legacyV1Url = `${v1Base}/rates/USDC/1/NGN`;
  try {
    const rateRes = await fetch(legacyV1Url, {
      signal: AbortSignal.timeout(5000),
    });
    const rateData = (await rateRes.json().catch(() => null)) as
      | { status?: string; data?: unknown }
      | null;
    if (rateRes.ok && rateData?.status === "success") {
      const rate = parseV1RatePayload(rateData);
      if (rate > 0) return rate;
    }
  } catch (error) {
    console.warn("swap limit check: legacy v1 rate fetch failed:", error);
  }

  console.warn(
    "swap limit check: could not resolve USDC/NGN rate from aggregator",
  );
  return 0;
}

export type SwapLimitCheckResult =
  | { kind: "success"; id?: string; monthlyLimit: number; pooledWalletCount: number }
  | { kind: "rate_unavailable" }
  | { kind: "limit_exceeded"; monthlyLimit: number; pooledWalletCount: number }
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
  const kycWalletAddress = normalizedBodyWalletAddress;

  // The limit belongs to the verified identity, not this wallet: every wallet sharing
  // the caller's phone/ID draws from one pool and inherits the group's best tier.
  // Never fall back to a per-wallet scope on failure — a narrower pool would leave
  // siblings' spend uncounted and the cap bypassable.
  let scope;
  try {
    scope = await resolveIdentityScope(kycWalletAddress);
  } catch {
    return { kind: "kyc_db_error" };
  }

  const tierLimit = getKycTierLimit(scope.effectiveTier);

  // A capped limit of 0 means "no swaps until phone" (tier 0). An unlimited tier
  // must never hit this branch.
  if (!tierLimit.unlimited && tierLimit.monthly === 0) {
    return { kind: "kyc_required" };
  }

  // Sent to the RPC and echoed back in success/limit_exceeded results.
  // null signals "no cap" to the RPC; 0 is only reachable for capped tiers above.
  const monthlyLimit = tierLimit.unlimited ? 0 : tierLimit.monthly;
  // Echoed back so the blocked-swap copy can name the wallets sharing the allowance.
  const pooledWalletCount = scope.wallets.length;

  const rateNetworkSlug = normalizeRateNetworkSlug(
    typeof body.network === "string" ? body.network : null,
  );
  const cngnToUsdRate = await fetchCngnToUsdRate(rateNetworkSlug);

  const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
    "insert_swap_transaction_if_within_limit",
    {
      p_wallet_address: normalizedBodyWalletAddress,
      p_monthly_limit: tierLimit.unlimited ? null : tierLimit.monthly,
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
      p_scope_wallets: scope.wallets,
      p_identity_keys: scope.identityKeys,
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
    return { kind: "limit_exceeded", monthlyLimit, pooledWalletCount };
  }

  if (options.dryRun) {
    if (rpcData.ok === true) {
      return { kind: "success", monthlyLimit, pooledWalletCount };
    }
    return { kind: "unexpected_rpc" };
  }

  if (!rpcData.id) {
    return { kind: "unexpected_rpc" };
  }

  return { kind: "success", id: rpcData.id, monthlyLimit, pooledWalletCount };
}
