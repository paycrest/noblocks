import { NextRequest, NextResponse } from "next/server";
import { verifyJWT } from "@/app/lib/jwt";
import { DEFAULT_PRIVY_CONFIG } from "@/app/lib/config";
import config from "@/app/lib/config";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiError,
  trackApiRequest,
  trackApiResponse,
} from "@/app/lib/server-analytics";
import {
  encryptSolanaMessageHash,
  type SolanaOnChainRecipient,
} from "@/app/lib/solanaEncrypt";
import {
  buildCreateOrderTransaction,
  submitSignedCreateOrderTransaction,
} from "@/app/lib/solanaGateway";
import { collectLinkedSolanaAddressesForPrivyUserId } from "@/app/lib/privy";
import { isSolanaSponsorConfigured } from "@/app/lib/solanaSponsor";
import { isValidSolanaAddress } from "@/app/lib/validation";

const ROUTE = "/api/solana/create-order" as const;
const GENERIC_ERROR = "Failed to process Solana order";

type BuildBody = {
  phase: "build";
  depositor: string;
  mint?: string;
  amount: string;
  rate: string;
  senderFee?: string;
  senderFeeRecipient?: string;
  refundAddress: string;
  recipient: SolanaOnChainRecipient;
};

type SubmitBody = {
  phase: "submit";
  signedTransaction: string;
  orderIdHex?: string;
  depositor?: string;
};

function parseBigIntField(value: string, field: string): bigint {
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch {
    throw new Error(`Invalid ${field}`);
  }
  if (parsed < BigInt(0)) {
    throw new Error(`${field} must be non-negative`);
  }
  return parsed;
}

async function resolveAuthorizedSolanaDepositors(
  authUserId: string,
): Promise<string[]> {
  return collectLinkedSolanaAddressesForPrivyUserId(authUserId);
}

function depositorNotAuthorizedResponse() {
  return NextResponse.json(
    { error: "Depositor does not match your linked Solana wallet" },
    { status: 403 },
  );
}

export const POST = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    if (!config.solanaEnabled) {
      return NextResponse.json({ error: "Solana is not enabled" }, { status: 404 });
    }

    if (!isSolanaSponsorConfigured()) {
      return NextResponse.json(
        {
          error:
            "SPONSOR_SOLANA_WALLET_PRIVATE_KEY is not configured on the server",
        },
        { status: 503 },
      );
    }

    const walletAddress = request.headers
      .get("x-wallet-address")
      ?.toLowerCase();

    if (!walletAddress) {
      trackApiError(request, ROUTE, "POST", new Error("Unauthorized"), 401);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      trackApiError(
        request,
        ROUTE,
        "POST",
        new Error("Missing or invalid authorization header"),
        401,
        { wallet_address: walletAddress },
      );
      return NextResponse.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 },
      );
    }

    const token = authHeader.substring(7);
    const { payload } = await verifyJWT(token, DEFAULT_PRIVY_CONFIG);
    const authUserId = payload.sub || payload.userId;

    if (!authUserId || typeof authUserId !== "string") {
      return NextResponse.json(
        { error: "Invalid token: missing user ID" },
        { status: 401 },
      );
    }

    trackApiRequest(request, ROUTE, "POST", {
      wallet_address: walletAddress,
      privy_user_id: authUserId,
    });

    const body = (await request.json()) as BuildBody | SubmitBody;
    const authorizedDepositors = await resolveAuthorizedSolanaDepositors(
      authUserId,
    );

    if (body.phase === "submit") {
      const { signedTransaction, depositor: submitDepositor } = body;
      if (!signedTransaction?.trim()) {
        return NextResponse.json(
          { error: "Missing signedTransaction" },
          { status: 400 },
        );
      }

      if (submitDepositor?.trim()) {
        const trimmed = submitDepositor.trim();
        if (!isValidSolanaAddress(trimmed)) {
          return NextResponse.json(
            { error: "Invalid Solana depositor address" },
            { status: 400 },
          );
        }
        if (!authorizedDepositors.includes(trimmed)) {
          return depositorNotAuthorizedResponse();
        }
      }

      const { signature, confirmed } = await submitSignedCreateOrderTransaction(
        signedTransaction.trim(),
        body.orderIdHex,
      );

      const responseTime = Date.now() - startTime;
      trackApiResponse(ROUTE, "POST", 200, responseTime, {
        wallet_address: walletAddress,
        privy_user_id: authUserId,
        phase: "submit",
        confirmed,
      });

      return NextResponse.json({
        success: true,
        transactionHash: signature,
        orderId: body.orderIdHex,
        confirmed,
      });
    }

    if (body.phase !== "build") {
      return NextResponse.json({ error: "Invalid phase" }, { status: 400 });
    }

    const {
      depositor,
      mint,
      amount,
      rate,
      senderFee,
      senderFeeRecipient,
      refundAddress,
      recipient,
    } = body;

    if (
      !depositor ||
      !amount ||
      !rate ||
      !refundAddress ||
      !recipient?.accountIdentifier ||
      !recipient?.accountName ||
      !recipient?.institution
    ) {
      return NextResponse.json(
        { error: "Missing required build fields" },
        { status: 400 },
      );
    }

    const depositorTrimmed = depositor.trim();
    if (!isValidSolanaAddress(depositorTrimmed) || !isValidSolanaAddress(refundAddress)) {
      return NextResponse.json(
        { error: "Invalid Solana depositor or refund address" },
        { status: 400 },
      );
    }

    if (authorizedDepositors.length === 0) {
      return NextResponse.json(
        { error: "No linked Solana wallet found for this account" },
        { status: 403 },
      );
    }
    if (!authorizedDepositors.includes(depositorTrimmed)) {
      return depositorNotAuthorizedResponse();
    }

    const senderApiKeyId = config.aggregatorSenderApiKey;
    if (!senderApiKeyId) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_AGGREGATOR_SENDER_API_KEY_ID is not configured" },
        { status: 503 },
      );
    }

    const { raw: messageHash } = await encryptSolanaMessageHash({
      ...recipient,
      metadata: {
        ...(recipient.metadata ?? {}),
        apiKey: senderApiKeyId,
      },
    });

    const built = await buildCreateOrderTransaction({
      depositor: depositorTrimmed,
      mint: mint?.trim(),
      amount: parseBigIntField(amount, "amount"),
      rate: parseBigIntField(rate, "rate"),
      senderFee: senderFee
        ? parseBigIntField(senderFee, "senderFee")
        : BigInt(0),
      senderFeeRecipient: senderFeeRecipient?.trim(),
      refundAddress: refundAddress.trim(),
      messageHash,
    });

    const responseTime = Date.now() - startTime;
    trackApiResponse(ROUTE, "POST", 200, responseTime, {
      wallet_address: walletAddress,
      privy_user_id: authUserId,
      phase: "build",
    });

    return NextResponse.json({
      success: true,
      transaction: built.transactionBase64,
      orderId: built.orderIdHex,
      nonce: built.nonce,
      feePayer: built.feePayer,
    });
  } catch (error: unknown) {
    console.error("[API] Error in Solana create-order:", error);
    const responseTime = Date.now() - startTime;
    const err =
      error instanceof Error ? error : new Error(GENERIC_ERROR);
    const walletAddressCatch = request.headers
      .get("x-wallet-address")
      ?.toLowerCase();
    trackApiError(request, ROUTE, "POST", err, 500, {
      ...(walletAddressCatch ? { wallet_address: walletAddressCatch } : {}),
      response_time_ms: responseTime,
    });
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }
});
