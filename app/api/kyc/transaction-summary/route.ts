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

    // Currency casing varies by source (e.g. "cNGN" vs "CNGN"), so rows are
    // normalized to uppercase at fetch time and compared against uppercase
    // constants — matching upper(...) in insert_swap_transaction_if_within_limit.
    const normalizeCurrency = (value: unknown) =>
      String(value ?? "").toUpperCase();
    const TRACKED_SWAP_CURRENCIES = new Set(["USDC", "USDT", "CUSD", "CNGN"]);
    const STABLE_TO_CURRENCIES = new Set(["USDC", "USDT", "CUSD"]);
    // Statuses that consume the monthly limit — keep in sync with
    // insert_swap_transaction_if_within_limit. Pending orders count because funds
    // are already committed; refunded/refunding/expired/failed rows do not.
    // 'fulfilling' is legacy-only (the app maps the aggregator's "fulfilling" to
    // 'pending') but is kept in case old rows carry it.
    const SPEND_STATUSES = ["pending", "fulfilling", "fulfilled", "completed"];

    // "offramp" is the current label; "swap" is the legacy label used before
    // 2026-05-29 (commit 73ebf7b normalized swap→offramp and added the
    // transaction_type CHECK). Both denote the same sell, so include both.
    const { data: swapTransactions, error: swapError } = await supabaseAdmin
      .from("transactions")
      .select("amount_sent, from_currency, created_at")
      .eq("wallet_address", walletAddress)
      .in("transaction_type", ["offramp", "swap"])
      .in("status", SPEND_STATUSES)
      .gte("created_at", monthStart.toISOString());

    const { data: onrampTransactions, error: onrampError } = await supabaseAdmin
      .from("transactions")
      .select(
        "amount_sent, amount_received, from_currency, to_currency, created_at",
      )
      .eq("wallet_address", walletAddress)
      .eq("transaction_type", "onramp")
      .in("status", SPEND_STATUSES)
      .gte("created_at", monthStart.toISOString());

    const error = swapError ?? onrampError;
    const transactions = [
      // The tracked-currency filter lives here rather than in the query because
      // PostgREST cannot compare a column case-insensitively in .in().
      ...(swapTransactions ?? [])
        .map((tx) => ({
          ...tx,
          kind: "offramp" as const,
          from_currency: normalizeCurrency(tx.from_currency),
        }))
        .filter((tx) => TRACKED_SWAP_CURRENCIES.has(tx.from_currency)),
      ...(onrampTransactions ?? []).map((tx) => ({
        ...tx,
        kind: "onramp" as const,
        from_currency: normalizeCurrency(tx.from_currency),
        to_currency: normalizeCurrency(tx.to_currency),
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
        tx.from_currency === "CNGN" ||
        ("to_currency" in tx && tx.to_currency === "CNGN"),
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
        const recv = parseFloat(String(tx.amount_received)) || 0;
        const sent = parseFloat(String(tx.amount_sent)) || 0;
        if (STABLE_TO_CURRENCIES.has(tx.to_currency)) {
          usdAmount = recv;
        } else if (tx.to_currency === "CNGN" && cngnToUsdRate) {
          usdAmount = recv / cngnToUsdRate;
        } else if (cngnToUsdRate && sent > 0) {
          usdAmount = sent / cngnToUsdRate;
        } else {
          usdAmount = recv;
        }
      } else {
        const rawAmount = parseFloat(tx.amount_sent) || 0;
        if (tx.from_currency === "CNGN") {
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
