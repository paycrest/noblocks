import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import type { TransactionHistory, TransactionResponse } from "@/app/types";
import { withRateLimit } from "@/app/lib/rate-limit";
import { 
  trackTransactionEvent, 
  trackApiRequest, 
  trackApiResponse, 
  trackApiError 
} from "@/app/lib/server-analytics";

export const GET = withRateLimit(
  async (  
    request: NextRequest,  
    context: { params: { address: string } },  
  ) => {  
    const startTime = Date.now();  
    const { address } = context.params;  

    // Fallback to URL pathname if address is not in params
    const finalAddress = address || request.nextUrl.pathname.split("/").pop();
    
    try {

      if (!finalAddress) {
              trackApiError(request, request.nextUrl.pathname, 'GET', new Error('Missing wallet address'), 400);  

        return NextResponse.json(
          { success: false, error: "Missing wallet address" },
          { status: 400 },
        );
      }
      

      // Track API request
      trackApiRequest(request, `/api/v1/transactions/address/${finalAddress}`, 'GET', {
        wallet_address: finalAddress,
      });

      const searchParams = request.nextUrl.searchParams;
      const page = parseInt(searchParams.get("page") || "1");
      const limit = parseInt(searchParams.get("limit") || "20");
      const offset = (page - 1) * limit;

      // Query transactions for specific wallet
      const {
        data: transactions,
        error,
        count,
      } = await supabaseAdmin
        .from("transactions")
        .select("*", { count: "exact" })
        .eq("wallet_address", finalAddress)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error("Supabase error:", error);
        throw error;
      }

      const response: TransactionResponse = {
        success: true,
        data: {
          total: count || 0,
          page,
          limit,
          transactions: transactions as TransactionHistory[],
        },
      };

      // Track successful API response
      const responseTime = Date.now() - startTime;
      trackApiResponse(`/api/v1/transactions/address/${finalAddress}`, 'GET', 200, responseTime, {
        wallet_address: finalAddress,
        total_transactions: count || 0,
        page,
        limit,
      });

      // Track business event
      trackTransactionEvent('Address Transactions Retrieved', finalAddress, {
        total_transactions: count || 0,
        page,
        limit,
      });

      return NextResponse.json(response);
    } catch (error) {
      console.error("Error fetching transactions:", error);

      // Track API error
      const responseTime = Date.now() - startTime;
      trackApiError(request, `/api/v1/transactions/address/${finalAddress}`, 'GET', error as Error, 500, {
        response_time_ms: responseTime,
      });

      return NextResponse.json(
        { success: false, error: "Internal server error" },
        { status: 500 },
      );
    }
  },
);
