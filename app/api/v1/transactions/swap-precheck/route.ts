import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiRequest,
  trackApiResponse,
  trackApiError,
} from "@/app/lib/server-analytics";
import {
  assertTransactionWalletAuthorized,
  executeSwapTransactionLimitCheck,
} from "@/app/lib/swap-transaction-limit-server";

const PRECHECK_PATH = "/api/v1/transactions/swap-precheck";

/**
 * Verifies monthly KYC swap limits using the same RPC as POST /transactions (dry run),
 * without inserting. Call before on-chain createOrder so users are not charged on-chain
 * when the subsequent save would fail the limit check.
 */
export const POST = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    const walletAddress = request.headers.get("x-wallet-address")?.toLowerCase();
    if (!walletAddress) {
      trackApiError(request, PRECHECK_PATH, "POST", new Error("Unauthorized"), 401);
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    trackApiRequest(request, PRECHECK_PATH, "POST", {
      wallet_address: walletAddress,
    });

    const body = await request.json();

    if (!body?.walletAddress) {
      trackApiError(
        request,
        PRECHECK_PATH,
        "POST",
        new Error("Missing wallet address in body"),
        400,
      );
      return NextResponse.json(
        { success: false, error: "Bad Request: Missing wallet address" },
        { status: 400 },
      );
    }

    const required = [
      "fromCurrency",
      "toCurrency",
      "amountSent",
      "amountReceived",
      "fee",
    ] as const;
    for (const key of required) {
      if (body[key] === undefined || body[key] === null || body[key] === "") {
        trackApiError(
          request,
          PRECHECK_PATH,
          "POST",
          new Error(`Missing ${key}`),
          400,
        );
        return NextResponse.json(
          { success: false, error: `Bad Request: Missing ${key}` },
          { status: 400 },
        );
      }
    }

    const normalizedBodyWalletAddress = String(body.walletAddress).toLowerCase();

    const walletAuth = await assertTransactionWalletAuthorized(
      request,
      walletAddress,
      normalizedBodyWalletAddress,
    );
    if (!walletAuth.ok) {
      if (walletAuth.reason === "missing_user_context") {
        trackApiError(
          request,
          PRECHECK_PATH,
          "POST",
          new Error("Missing user context for wallet mismatch resolution"),
          401,
        );
      } else if (walletAuth.reason === "wallet_mismatch") {
        trackApiError(
          request,
          PRECHECK_PATH,
          "POST",
          new Error("Wallet address mismatch"),
          403,
        );
      } else if (walletAuth.reason === "privy_lookup_failed") {
        trackApiError(
          request,
          PRECHECK_PATH,
          "POST",
          new Error("Linked wallet lookup failed"),
          503,
        );
      }
      return walletAuth.response;
    }

    const recipient =
      body.recipient && typeof body.recipient === "object"
        ? body.recipient
        : { account_name: "", institution: "", account_identifier: "" };

    const swapResult = await executeSwapTransactionLimitCheck(
      normalizedBodyWalletAddress,
      {
        transactionType: "swap",
        fromCurrency: String(body.fromCurrency),
        toCurrency: String(body.toCurrency),
        amountSent: body.amountSent,
        amountReceived: body.amountReceived,
        fee: body.fee,
        recipient,
        status: "pending",
      },
      { dryRun: true, explorerLink: null, normalizedEmail: null },
    );

    if (swapResult.kind === "kyc_db_error") {
      return NextResponse.json(
        {
          success: false,
          error: "Unable to verify transaction limits. Please try again.",
        },
        { status: 503 },
      );
    }

    if (swapResult.kind === "kyc_required") {
      trackApiError(request, PRECHECK_PATH, "POST", new Error("KYC required"), 403);
      return NextResponse.json(
        {
          success: false,
          error: "Identity verification required to make transactions.",
        },
        { status: 403 },
      );
    }

    if (swapResult.kind === "rate_unavailable") {
      return NextResponse.json(
        {
          success: false,
          error: "Unable to verify transaction amount. Please try again.",
        },
        { status: 503 },
      );
    }

    if (swapResult.kind === "limit_exceeded") {
      trackApiError(
        request,
        PRECHECK_PATH,
        "POST",
        new Error("Monthly KYC limit exceeded"),
        403,
      );
      return NextResponse.json(
        {
          success: false,
          error: `Monthly transaction limit of $${swapResult.monthlyLimit.toLocaleString()} reached. Upgrade your verification tier to continue.`,
        },
        { status: 403 },
      );
    }

    if (swapResult.kind === "rpc_failed") {
      throw swapResult.error;
    }

    if (swapResult.kind === "unexpected_rpc") {
      throw new Error(
        "Unexpected RPC response from insert_swap_transaction_if_within_limit (dry run)",
      );
    }

    const responseTime = Date.now() - startTime;
    trackApiResponse(PRECHECK_PATH, "POST", 200, responseTime, {
      wallet_address: normalizedBodyWalletAddress,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("swap-precheck error:", error);
    const responseTime = Date.now() - startTime;
    trackApiError(request, PRECHECK_PATH, "POST", error as Error, 500, {
      response_time_ms: responseTime,
    });
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
});
