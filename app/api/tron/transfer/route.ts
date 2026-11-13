import { NextRequest, NextResponse } from "next/server";
import config from "@/app/lib/config";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiRequest,
  trackApiResponse,
  trackApiError,
} from "@/app/lib/server-analytics";
import { isInjectedUserId } from "@/app/lib/injected-identity";
import { isSenderPaymentOrderUuid } from "@/app/lib/payment-order-id";
import { assertCallerOwnsSenderOrder } from "@/app/lib/transaction-wallet-auth";
import { fetchLiveDeposit } from "@/app/lib/payment-order-offramp";
import { amountNumberToBaseUnits } from "@/app/lib/tokenSpendAmount";
import { getPrivyClient } from "@/app/lib/privy";
import { supabaseAdmin } from "@/app/lib/supabase";
import { fetchTokens } from "@/app/api/aggregator";
import { getExplorerLink, normalizeNetworkName } from "@/app/utils";
import {
  isTronSponsorConfigured,
  isValidTronBase58,
  sendTrc20WithSponsor,
  TronOutcomeUnknownError,
  TronRejectedError,
} from "@/app/lib/tron";

const ROUTE = "/api/tron/transfer" as const;
const DAY_MS = 24 * 60 * 60 * 1000;

function envNumber(raw: string | undefined, fallback: number): number {
  const value = raw === undefined || raw === "" ? NaN : Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** The caller's Privy Tron wallet with this address (its id signs), or null. */
async function findTronWallet(userId: string, address: string): Promise<{ id: string } | null> {
  const user = await getPrivyClient().getUser(userId);
  for (const account of user?.linkedAccounts ?? []) {
    const wallet = account as { type?: string; chainType?: string; chain_type?: string; id?: string; address?: string };
    const chainType = wallet.chainType ?? wallet.chain_type;
    if (wallet.type === "wallet" && chainType === "tron" && wallet.address === address && wallet.id) {
      return { id: wallet.id };
    }
  }
  return null;
}

/**
 * Sends USDT from the caller's Noblocks Tron wallet, with Noblocks paying the TRX. The server
 * builds and signs every transaction (Privy raw_sign as the user), so the sponsor only ever pays
 * for transfers it chose to make:
 *
 * - `deposit`: pays a live sell order of the caller (initiated, nothing paid, inside its deposit
 *   window) — exactly its `amountToTransfer`, from its refund wallet to its deposit address. The
 *   sell already charged a fee covering the TRX.
 * - `withdrawal`: a transfer the user chose. Sponsored only at or above TRON_WITHDRAW_MIN and up to
 *   TRON_WITHDRAW_DAILY_SPONSORED per 24h; past that the wallet must hold its own TRX. The server
 *   records the transfer row itself.
 */
export const POST = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();
  const walletAddress = request.headers.get("x-wallet-address")?.toLowerCase();
  const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => {
    trackApiError(request, ROUTE, "POST", new Error(error), status);
    return NextResponse.json({ success: false, error, ...extra }, { status });
  };

  if (!walletAddress) return fail(401, "Unauthorized");
  if (!config.tronEnabled) return fail(404, "Tron is not enabled");
  if (!isTronSponsorConfigured()) {
    console.error(`[${ROUTE}] SPONSOR_TRON_WALLET_PRIVATE_KEY is not configured`);
    return fail(503, "Tron transfers are temporarily unavailable");
  }
  const userId = request.headers.get("x-user-id");
  const userJwt = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!userId || isInjectedUserId(userId) || !userJwt) {
    return fail(403, "Sending on Tron needs your Noblocks wallet");
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Invalid JSON body");
  }
  const kind = body.kind;
  if (kind !== "deposit" && kind !== "withdrawal") {
    return fail(400, "kind must be deposit or withdrawal");
  }
  trackApiRequest(request, ROUTE, "POST", { wallet_address: walletAddress, kind });

  let transfer: {
    owner: string;
    to: string;
    contract: string;
    amount: bigint;
    symbol: string;
    amountText: string;
    allowTopUp: boolean;
  };

  try {
    if (kind === "deposit") {
      const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
      if (!isSenderPaymentOrderUuid(orderId)) return fail(400, "orderId is required");
      const owner = await assertCallerOwnsSenderOrder(request, orderId, walletAddress);
      if (!owner.ok) return fail(owner.status, owner.error);
      const live = await fetchLiveDeposit(orderId, "Tron", request.headers);
      if (!live.ok) return fail(live.status, live.error);
      const { deposit } = live;
      transfer = {
        owner: deposit.depositorAddress,
        to: deposit.receiveAddress,
        contract: deposit.token.contractAddress,
        amount: amountNumberToBaseUnits(deposit.amountToTransfer, deposit.token.decimals),
        symbol: deposit.token.symbol,
        amountText: deposit.amountToTransfer,
        allowTopUp: true,
      };
    } else {
      const from = typeof body.from === "string" ? body.from.trim() : "";
      const to = typeof body.to === "string" ? body.to.trim() : "";
      const symbol = typeof body.token === "string" ? body.token.trim().toUpperCase() : "";
      const amountText = typeof body.amount === "string" ? body.amount.trim() : "";
      if (!isValidTronBase58(from) || !isValidTronBase58(to)) {
        return fail(400, "Enter a valid Tron address");
      }
      const token = (await fetchTokens()).find(
        (t) => t.symbol.toUpperCase() === symbol && normalizeNetworkName(t.network) === "Tron",
      );
      if (!token || !isValidTronBase58(token.contractAddress)) {
        return fail(400, `${symbol || "This token"} is not available on Tron`);
      }
      let amount: bigint;
      try {
        amount = amountNumberToBaseUnits(amountText, Number(token.decimals));
      } catch (error) {
        return fail(400, error instanceof Error ? error.message : "Invalid amount");
      }
      if (amount <= BigInt(0)) return fail(400, "Enter an amount");

      const minimum = envNumber(process.env.TRON_WITHDRAW_MIN, 5);
      const dailyLimit = envNumber(process.env.TRON_WITHDRAW_DAILY_SPONSORED, 3);
      const { count, error } = await supabaseAdmin
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("wallet_address", walletAddress)
        .eq("transaction_type", "transfer")
        .eq("network", "Tron")
        .gte("created_at", new Date(Date.now() - DAY_MS).toISOString());
      if (error) {
        console.error(`[${ROUTE}] withdrawal count failed:`, error);
        return fail(503, "Could not check your withdrawal limit. Please try again.");
      }
      transfer = {
        owner: from,
        to,
        contract: token.contractAddress,
        amount,
        symbol: token.symbol,
        amountText,
        // Below the minimum or past the daily count, the wallet pays its own TRX.
        allowTopUp: Number(amountText) >= minimum && (count ?? 0) < dailyLimit,
      };
    }

    const wallet = await findTronWallet(userId, transfer.owner);
    if (!wallet) return fail(403, "That Tron wallet is not yours");

    const result = await sendTrc20WithSponsor({
      owner: transfer.owner,
      to: transfer.to,
      contract: transfer.contract,
      amount: transfer.amount,
      allowTopUp: transfer.allowTopUp,
      signer: { walletId: wallet.id, userJwt, userId },
    });

    if (kind === "withdrawal") {
      // Server-recorded, so the daily sponsored count above cannot be dodged by not saving.
      const { error } = await supabaseAdmin.from("transactions").insert({
        wallet_address: walletAddress,
        transaction_type: "transfer",
        from_currency: transfer.symbol,
        to_currency: transfer.symbol,
        amount_sent: Number(transfer.amountText),
        amount_received: Number(transfer.amountText),
        fee: 0,
        recipient: { account_name: "", institution: "", account_identifier: transfer.to },
        status: "completed",
        network: "Tron",
        tx_hash: result.txid,
        explorer_link: getExplorerLink("Tron", result.txid),
      });
      if (error) console.error(`[${ROUTE}] failed to record withdrawal ${result.txid}:`, error);
    }

    trackApiResponse(ROUTE, "POST", 200, Date.now() - startTime, {
      kind,
      topped_up_sun: result.toppedUpSun.toString(),
    });
    return NextResponse.json({ success: true, transactionHash: result.txid });
  } catch (error) {
    if (error instanceof TronRejectedError) return fail(400, error.message);
    if (error instanceof TronOutcomeUnknownError) {
      // It may still land: never offer a retry that could pay twice.
      return fail(502, error.message, { outcome: "unknown" });
    }
    console.error(`[${ROUTE}] unexpected error:`, error);
    return fail(500, "Failed to process the Tron transfer");
  }
});
