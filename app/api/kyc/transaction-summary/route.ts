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

    const TRACKED_SWAP_CURRENCIES = ["USDC", "USDT", "cUSD", "cNGN"];
    const STABLE_TO_CURRENCIES = ["USDC", "USDT", "cUSD"];

    const { data: swapTransactions, error: swapError } = await supabaseAdmin
      .from("transactions")
      .select("amount_sent, from_currency, created_at")
      .eq("wallet_address", walletAddress)
      .eq("transaction_type", "offramp")
      .in("status", ["fulfilling", "completed"])
      .in("from_currency", TRACKED_SWAP_CURRENCIES)
      .gte("created_at", monthStart.toISOString());

    const { data: onrampTransactions, error: onrampError } = await supabaseAdmin
      .from("transactions")
      .select(
        "amount_sent, amount_received, from_currency, to_currency, created_at",
      )
      .eq("wallet_address", walletAddress)
      .eq("transaction_type", "onramp")
      .in("status", ["pending", "fulfilling", "completed"])
      .gte("created_at", monthStart.toISOString());

    const error = swapError ?? onrampError;
    const transactions = [
      ...(swapTransactions ?? []).map((tx) => ({
        ...tx,
        kind: "offramp" as const,
      })),
      ...(onrampTransactions ?? []).map((tx) => ({
        ...tx,
        kind: "onramp" as const,
      })),
    ];

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
    const hasCngnTxs = transactions?.some(
      (tx) =>
        tx.from_currency === "cNGN" ||
        ("to_currency" in tx && tx.to_currency === "cNGN"),
    );
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

      let usdAmount: number;
      if (tx.kind === "onramp") {
        const toCur = String(tx.to_currency ?? "").toUpperCase();
        const recv = parseFloat(String(tx.amount_received)) || 0;
        const sent = parseFloat(String(tx.amount_sent)) || 0;
        if (STABLE_TO_CURRENCIES.includes(toCur)) {
          usdAmount = recv;
        } else if (toCur === "CNGN" && cngnToUsdRate) {
          usdAmount = recv / cngnToUsdRate;
        } else if (cngnToUsdRate && sent > 0) {
          usdAmount = sent / cngnToUsdRate;
        } else {
          usdAmount = recv;
        }
      } else {
        const rawAmount = parseFloat(tx.amount_sent) || 0;
        if (tx.from_currency === "cNGN") {
          usdAmount = rawAmount / cngnToUsdRate!;
        } else {
          usdAmount = rawAmount;
        }
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
