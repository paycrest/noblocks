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
    const walletAddress = request.headers.get("x-wallet-address");

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
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Fetch transactions for the current month
    const { data: transactions, error } = await supabaseAdmin
      .from("transactions")
      .select("amount_sent, created_at")
      .eq("wallet_address", walletAddress)
      .eq("transaction_type", "swap")
      .in("status", ["fulfilling", "completed"])
      .gte("created_at", monthStart.toISOString());

    if (error) {
      trackApiError(request, "/api/kyc/transaction-summary", "GET", error, 500);
      return NextResponse.json(
        { success: false, error: "Failed to fetch transaction summary" },
        { status: 500 },
      );
    }

    let dailySpent = 0;
    let monthlySpent = 0;
    let lastTransactionDate: string | null = null;

    transactions?.forEach((tx) => {
      const txDate = new Date(tx.created_at);
      const amount = parseFloat(tx.amount_sent) || 0;

      monthlySpent += amount;

      if (txDate >= today) {
        dailySpent += amount;
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
