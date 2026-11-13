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
import {
  claimSenderOrderDeposit,
  releaseSenderOrderDeposit,
} from "@/app/lib/swap-transaction-limit-server";
import {
  broadcastSponsoredTransaction,
  buildSponsoredTokenTransfer,
  canReplaceSolanaDeposit,
  isSolanaSponsorConfigured,
  type TokenTransferParams,
  verifySponsoredTokenTransfer,
} from "@/app/lib/solanaSponsor";

const ROUTE = "/api/solana/transfer" as const;

/**
 * Pays a Solana sender-API sell's deposit, with Noblocks paying the SOL fee.
 *
 * `build`: for a live order of the caller, returns a USDC `TransferChecked` of exactly the
 * order's `amountToTransfer` from the order's refund wallet (the caller's own Solana wallet,
 * checked when the order was created) to its deposit address, already signed by the sponsor.
 * `submit`: broadcasts it once the wallet has added its signature, but only if it is exactly that
 * transfer and no other transfer for the order was sent: its signature is claimed on the order's
 * row first (see claimSenderOrderDeposit), and the claim is dropped again if the cluster rejects
 * it. The sponsor signs nothing else, so it cannot be made to pay for any other transaction.
 */
export const POST = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();
  const walletAddress = request.headers.get("x-wallet-address")?.toLowerCase();
  const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => {
    trackApiError(request, ROUTE, "POST", new Error(error), status);
    return NextResponse.json({ success: false, error, ...extra }, { status });
  };

  if (!walletAddress) return fail(401, "Unauthorized");
  if (!config.solanaEnabled) return fail(404, "Solana is not enabled");
  if (!isSolanaSponsorConfigured()) {
    console.error(`[${ROUTE}] SPONSOR_SOLANA_WALLET_PRIVATE_KEY is not configured`);
    return fail(503, "Solana transfers are temporarily unavailable");
  }
  const userId = request.headers.get("x-user-id");
  if (!userId || isInjectedUserId(userId)) {
    return fail(403, "Selling on Solana needs your Noblocks wallet");
  }

  let body: { phase?: unknown; orderId?: unknown; signedTransaction?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail(400, "Invalid JSON body");
  }
  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  if (!isSenderPaymentOrderUuid(orderId)) return fail(400, "orderId is required");
  if (body.phase !== "build" && body.phase !== "submit") {
    return fail(400, "phase must be build or submit");
  }

  trackApiRequest(request, ROUTE, "POST", { wallet_address: walletAddress, phase: body.phase });

  try {
    const owner = await assertCallerOwnsSenderOrder(request, orderId, walletAddress);
    if (!owner.ok) return fail(owner.status, owner.error);

    const live = await fetchLiveDeposit(orderId, "Solana", request.headers);
    if (!live.ok) return fail(live.status, live.error);
    const { deposit } = live;

    let amount: bigint;
    try {
      amount = amountNumberToBaseUnits(deposit.amountToTransfer, deposit.token.decimals);
    } catch (error) {
      return fail(502, error instanceof Error ? error.message : "Invalid deposit amount");
    }
    const transfer: TokenTransferParams = {
      owner: deposit.depositorAddress,
      recipient: deposit.receiveAddress,
      mint: deposit.token.contractAddress,
      amount,
      decimals: deposit.token.decimals,
    };

    if (body.phase === "build") {
      const built = await buildSponsoredTokenTransfer(transfer);
      trackApiResponse(ROUTE, "POST", 200, Date.now() - startTime, { phase: "build" });
      return NextResponse.json({ success: true, ...built });
    }

    const signed =
      typeof body.signedTransaction === "string" ? body.signedTransaction.trim() : "";
    if (!signed) return fail(400, "signedTransaction is required");
    const verified = verifySponsoredTokenTransfer(signed, transfer);
    if (!verified.ok) return fail(400, verified.error);
    const claim = await claimSenderOrderDeposit(
      orderId,
      verified.signature,
      canReplaceSolanaDeposit,
    );
    if (!claim.ok) return fail(claim.status, claim.error);

    const result = await broadcastSponsoredTransaction(signed);
    if (result.kind === "rejected") {
      await releaseSenderOrderDeposit(orderId, verified.signature);
      return fail(400, result.error);
    }
    if (result.kind === "unknown") {
      // It may still land: the client must not offer a retry that could pay twice.
      return fail(502, result.error, { outcome: "unknown" });
    }
    trackApiResponse(ROUTE, "POST", 200, Date.now() - startTime, {
      phase: "submit",
      confirmed: result.confirmed,
    });
    return NextResponse.json({
      success: true,
      transactionHash: result.signature,
      confirmed: result.confirmed,
    });
  } catch (error) {
    console.error(`[${ROUTE}] unexpected error:`, error);
    // A submit that threw may already have been broadcast.
    return fail(
      body.phase === "submit" ? 502 : 500,
      "Failed to process the Solana transfer",
      body.phase === "submit" ? { outcome: "unknown" } : {},
    );
  }
});
