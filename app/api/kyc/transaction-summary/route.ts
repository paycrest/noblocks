import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import {
  trackApiRequest,
  trackApiResponse,
  trackApiError,
} from "@/app/lib/server-analytics";

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    trackApiRequest(request, "/api/kyc/transaction-summary", "GET");

    // Get the wallet address from the header set by the middleware
    const walletAddress = request.headers.get("x-wallet-address")?.trim().toLowerCase();

    if (!walletAddress) {
      trackApiError(
        request,
        "/api/kyc/transaction-summary",
        "GET",
        new Error("Unauthorized"),
        401,
      );
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const now = new Date();
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );

    // Fetch cNGN→USD rate from the aggregator (NGN per 1 USDC).
    // If unavailable, cNGN transactions are excluded to avoid inflating USD totals.
    let cngnToUsdRate: number | null = null;
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
      // Rate fetch failed — cNGN transactions will be excluded below
    }

    const TRACKED_CURRENCIES = ["USDC", "USDT", "cUSD", "cNGN"];

    const { data: transactions, error } = await supabaseAdmin
      .from("transactions")
      .select("amount_sent, from_currency, created_at")
      .eq("wallet_address", walletAddress)
      .eq("transaction_type", "swap")
      .in("status", ["fulfilling", "completed"])
      .in("from_currency", TRACKED_CURRENCIES)
      .gte("created_at", monthStart.toISOString());

    if (error) {
      trackApiError(request, "/api/kyc/transaction-summary", "GET", error, 500);
      return NextResponse.json(
        { success: false, error: "Failed to fetch transaction summary" },
        { status: 500 },
      );
    }

    // If any cNGN transactions exist but we have no rate, we cannot produce accurate
    // compliance totals — return a partial-state indicator so callers know not to trust
    // the numbers for limit enforcement.
    const hasCngnTxs = transactions?.some((tx) => tx.from_currency === "cNGN");
    if (hasCngnTxs && cngnToUsdRate === null) {
      trackApiError(
        request,
        "/api/kyc/transaction-summary",
        "GET",
        new Error("cNGN rate unavailable"),
        503,
      );
      return NextResponse.json(
        {
          success: false,
          partial: true,
          error:
            "Transaction summary is incomplete: cNGN exchange rate is temporarily unavailable. Please try again shortly.",
        },
        { status: 503 },
      );
    }

    let dailySpent = 0;
    let monthlySpent = 0;
    let lastTransactionDate: string | null = null;

    transactions?.forEach((tx) => {
      const txDate = new Date(tx.created_at);
      const rawAmount = parseFloat(tx.amount_sent) || 0;

      let usdAmount: number;
      if (tx.from_currency === "cNGN") {
        // cngnToUsdRate is guaranteed non-null here (checked above)
        usdAmount = rawAmount / cngnToUsdRate!;
      } else {
        usdAmount = rawAmount; // USDC, USDT, cUSD are 1:1 with USD
      }

      monthlySpent += usdAmount;

      if (txDate >= today) {
        dailySpent += usdAmount;
      }

      if (!lastTransactionDate || txDate > new Date(lastTransactionDate)) {
        lastTransactionDate = tx.created_at;
      }
    });

    const responseTime = Date.now() - startTime;
    trackApiResponse("/api/kyc/transaction-summary", "GET", 200, responseTime);

    return NextResponse.json({
      success: true,
      dailySpent,
      monthlySpent,
      lastTransactionDate,
    });
  } catch (error) {
    trackApiError(
      request,
      "/api/kyc/transaction-summary",
      "GET",
      error as Error,
      500,
    );

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
