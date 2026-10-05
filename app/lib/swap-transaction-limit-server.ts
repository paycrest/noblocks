import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { getKycTierLimit } from "@/app/lib/kyc-tier-limits";
import { resolveIdentityScope } from "@/app/lib/kyc-identity";
import { collectLinkedEvmAddressesForPrivyUserId } from "@/app/lib/privy";
import { monthlyLimitReachedMessage } from "@/app/lib/kyc-limit-copy";
import { parseValidTransactionAmount, roundAmountForCurrency } from "@/app/utils";
import type { V2FiatProviderAccountDTO } from "@/app/types";

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

/**
 * What the client contributes to the transaction row of an order the server creates
 * through the sender API: the wallet the row is stored under (the same one it would
 * have saved under itself), the amount it showed as received, display labels for the
 * recipient and the email for receipts. Everything else (type, currencies, amount sent,
 * rate, network, order id, payment details) is set by the server.
 */
export type SenderOrderRecord = {
  walletAddress: string;
  amountReceived: number;
  recipient: Record<string, unknown>;
  email: string | null;
};

export type SenderOrderRow = Omit<SwapLimitRpcBody, "status" | "orderId"> & {
  transactionType: "onramp" | "offramp";
};

type RecordFailure = { ok: false; status: number; error: string };

/**
 * Validates and authorizes the `record` of a sender-order create request. The wallet
 * must be the caller's own (header wallet, or another wallet linked to the same Privy
 * user), exactly as for a transaction the client saves itself.
 */
export async function parseSenderOrderRecord(
  request: NextRequest,
  headerWalletAddress: string,
  raw: unknown,
): Promise<{ ok: true; record: SenderOrderRecord } | RecordFailure> {
  const body =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;
  if (!body) {
    // Only a page loaded before the server started recording these rows omits it.
    return { ok: false, status: 400, error: "Please refresh the page and try again." };
  }
  const walletAddress =
    typeof body.walletAddress === "string" ? body.walletAddress.trim().toLowerCase() : "";
  if (!walletAddress) {
    return { ok: false, status: 400, error: "Bad Request: record.walletAddress is required" };
  }
  const amountReceived = parseValidTransactionAmount(body.amountReceived);
  if (amountReceived === null) {
    return { ok: false, status: 400, error: "Bad Request: record.amountReceived must be a valid number" };
  }
  const recipient =
    body.recipient && typeof body.recipient === "object" && !Array.isArray(body.recipient)
      ? (body.recipient as Record<string, unknown>)
      : null;
  if (!recipient) {
    return { ok: false, status: 400, error: "Bad Request: record.recipient is required" };
  }

  const auth = await assertTransactionWalletAuthorized(request, headerWalletAddress, walletAddress);
  if (!auth.ok) {
    const payload = (await auth.response.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, status: auth.response.status, error: payload?.error ?? "Unauthorized" };
  }

  const email = typeof body.email === "string" ? body.email.trim() || null : null;
  return {
    ok: true,
    record: {
      walletAddress,
      amountReceived: roundAmountForCurrency(amountReceived),
      recipient,
      email,
    },
  };
}

/** Maps a limit-check refusal to the status and copy the transaction routes use. */
function limitFailure(result: SwapLimitCheckResult): RecordFailure | null {
  switch (result.kind) {
    case "success":
      return null;
    case "kyc_required":
      return { ok: false, status: 403, error: "Identity verification required to make transactions." };
    case "limit_exceeded":
      return {
        ok: false,
        status: 403,
        error: monthlyLimitReachedMessage(result.monthlyLimit, result.pooledWalletCount),
      };
    case "rate_unavailable":
      return { ok: false, status: 503, error: "Unable to verify transaction amount. Please try again." };
    default:
      return { ok: false, status: 503, error: "Unable to verify transaction limits. Please try again." };
  }
}

/** Dry-run of the monthly limit before a sender order is created. */
export async function precheckSenderOrderRow(
  record: SenderOrderRecord,
  row: SenderOrderRow,
): Promise<{ ok: true } | RecordFailure> {
  const result = await executeSwapTransactionLimitCheck(
    record.walletAddress,
    { ...row, status: "pending" },
    { dryRun: true, explorerLink: null, normalizedEmail: null },
  );
  return limitFailure(result) ?? { ok: true };
}

/**
 * Inserts the transaction row of a sender order the server just created, through the
 * same atomic limit check as a client-saved transaction. Because only the server writes
 * rows for sender orders (POST /api/v1/transactions refuses their ids), the row is what
 * order reads authorize against. On-ramp payment details come from the aggregator's
 * create response, never from the client.
 */
export async function recordSenderOrderRow(
  record: SenderOrderRecord,
  row: SenderOrderRow,
  orderId: string,
  providerAccount: unknown,
): Promise<{ ok: true; id: string } | RecordFailure> {
  const account = row.transactionType === "onramp" ? normalizeProviderAccount(providerAccount) : null;
  const recipient =
    account && row.transactionType === "onramp"
      ? { ...(row.recipient as Record<string, unknown>), institution: account.institution }
      : row.recipient;

  const result = await executeSwapTransactionLimitCheck(
    record.walletAddress,
    { ...row, recipient, status: "pending", orderId },
    { dryRun: false, explorerLink: null, normalizedEmail: record.email },
  );
  const failure = limitFailure(result);
  if (failure) return failure;
  if (result.kind !== "success" || !result.id) {
    return { ok: false, status: 500, error: "Could not record this order. Please try again." };
  }

  if (account) {
    const persisted = await persistOnrampProviderAccount(result.id, account);
    if (!persisted.ok) {
      console.error("Failed to persist onramp provider_account:", persisted.error);
      const rollback = await rollbackOnrampInsert(result.id);
      if (!rollback.ok) {
        console.error("Failed to roll back onramp insert:", rollback.error);
      }
      return { ok: false, status: 500, error: "Failed to save onramp payment details. Please try again." };
    }
  }
  return { ok: true, id: result.id };
}

/**
 * Row already recorded for a sender order, when it belongs to `walletAddress`. Lets a
 * client that still saves the row itself (an older bundle during a deploy) get the
 * existing row back instead of an error.
 */
export async function findSenderOrderRowForWallet(
  orderId: string,
  walletAddress: string,
): Promise<{ ok: true; id: string | null } | { ok: false; error: unknown }> {
  const { data, error } = await supabaseAdmin
    .from("transactions")
    .select("id, wallet_address")
    .eq("order_id", orderId)
    .in("transaction_type", ["onramp", "offramp"])
    .limit(1);
  if (error) return { ok: false, error };
  const row = data?.[0];
  if (!row || String(row.wallet_address ?? "").toLowerCase() !== walletAddress) {
    return { ok: true, id: null };
  }
  return { ok: true, id: String(row.id) };
}

/** Normalize aggregator VA fields for JSONB storage (Activepieces pay-in emails). */
export function normalizeProviderAccount(
  raw: unknown,
): V2FiatProviderAccountDTO | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const institution = typeof o.institution === "string" ? o.institution.trim() : "";
  const accountIdentifier =
    typeof o.accountIdentifier === "string" ? o.accountIdentifier.trim() : "";
  const accountName =
    typeof o.accountName === "string" ? o.accountName.trim() : "";
  const validUntil =
    typeof o.validUntil === "string" ? o.validUntil.trim() : "";
  if (!institution || !accountIdentifier || !accountName || !validUntil) {
    return null;
  }
  const amountToTransferRaw = o.amountToTransfer;
  const amountToTransfer =
    typeof amountToTransferRaw === "string"
      ? amountToTransferRaw.trim()
      : typeof amountToTransferRaw === "number" &&
          Number.isFinite(amountToTransferRaw)
        ? String(amountToTransferRaw)
        : "";
  const currency =
    typeof o.currency === "string" ? o.currency.trim() : "";

  return {
    institution,
    accountIdentifier,
    accountName,
    validUntil,
    ...(amountToTransfer ? { amountToTransfer } : {}),
    ...(currency ? { currency } : {}),
  };
}

async function persistOnrampProviderAccount(
  transactionId: string,
  providerAccount: V2FiatProviderAccountDTO,
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  const attempt = async () =>
    supabaseAdmin
      .from("transactions")
      .update({ provider_account: providerAccount })
      .eq("id", transactionId);

  let { error } = await attempt();
  if (error) {
    ({ error } = await attempt());
  }
  if (error) return { ok: false, error };
  return { ok: true };
}

/** Remove a limit-RPC insert when onramp provider_account persistence fails. */
async function rollbackOnrampInsert(
  transactionId: string,
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  const { error } = await supabaseAdmin
    .from("transactions")
    .delete()
    .eq("id", transactionId);
  if (error) return { ok: false, error };
  return { ok: true };
}
