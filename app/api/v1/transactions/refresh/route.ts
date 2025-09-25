import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";
import { 
  trackTransactionEvent, 
  trackApiRequest, 
  trackApiResponse, 
  trackApiError,
  trackBusinessEvent 
} from "@/app/lib/server-analytics";

// Route handler for POST requests - Transaction refresh
export const POST = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();
  
  try {
    // Get the wallet address from the header set by the middleware
    const walletAddress = request.headers
      .get("x-wallet-address")
      ?.toLowerCase();

    if (!walletAddress) {
      trackApiError(request, '/api/v1/transactions/refresh', 'POST', new Error('Unauthorized'), 401);
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    // Track API request
    trackApiRequest(request, '/api/v1/transactions/refresh', 'POST', {
      wallet_address: walletAddress,
    });

    const body = await request.json();
    const { refreshType = 'manual', page = 1, limit = 20 } = body;

    // Get current transaction count for comparison
    const { count: currentCount } = await supabaseAdmin  
      .from("transactions")  
      .select("*", { count: "exact", head: true })  
      .eq("wallet_address", walletAddress);

    // Fetch updated transactions
    const offset = (page - 1) * limit;
    const {
      data: transactions,
      error,
      count,
    } = await supabaseAdmin
      .from("transactions")
      .select("*", { count: "exact" })
      .eq("wallet_address", walletAddress)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Supabase query error:", error);
      throw error;
    }

    const response = {
      success: true,
      data: {
        total: count || 0,
        page,
        limit,
        transactions: transactions || [],
        refreshType,
        previousCount: currentCount || 0,
        newTransactions: (count || 0) - (currentCount || 0),
      },
    };

    // Track successful API response
    const responseTime = Date.now() - startTime;
    trackApiResponse('/api/v1/transactions/refresh', 'POST', 200, responseTime, {
      wallet_address: walletAddress,
      total_transactions: count || 0,
      page,
      limit,
      refresh_type: refreshType,
      new_transactions: (count || 0) - (currentCount || 0),
    });

    // Track business event
    trackBusinessEvent('Transaction List Refreshed', {
      wallet_address: walletAddress,
      total_transactions: count || 0,
      refresh_type: refreshType,
      new_transactions: (count || 0) - (currentCount || 0),
    });

    // Track transaction event
    trackTransactionEvent('Transaction List Refreshed', walletAddress, {
      total_transactions: count || 0,
      refresh_type: refreshType,
      new_transactions: (count || 0) - (currentCount || 0),
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error refreshing transactions:", error);

    // Track API error
    const responseTime = Date.now() - startTime;
    trackApiError(request, '/api/v1/transactions/refresh', 'POST', error as Error, 500, {
      response_time_ms: responseTime,
    });

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
});
